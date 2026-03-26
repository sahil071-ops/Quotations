import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText, buildProductEmbeddingText, contentHash } from '@/lib/embeddings';
import * as XLSX from 'xlsx';


function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
}

function extractField(row: Record<string, unknown>, ...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const val = row[candidate] ?? row[candidate.replace(/_/g, ' ')];
    if (val && typeof val === 'string' && val.trim()) return val.trim();
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingRaw = formData.get('column_mapping') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    // Normalize keys
    const rows: Record<string, unknown>[] = rawRows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        normalized[normalizeKey(key)] = val;
      }
      return normalized;
    });

    // Apply custom column mapping if provided
    const mapping: Record<string, string> = mappingRaw ? JSON.parse(mappingRaw) : {};

    const adminSupabase = createAdminSupabaseClient();
    let upserted = 0;
    let reembedded = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Apply mapping
        const mapped: Record<string, unknown> = { ...row };
        for (const [target, source] of Object.entries(mapping)) {
          if (row[source] !== undefined) mapped[target] = row[source];
        }

        const sku = extractField(mapped, 'sku', 'part_number', 'partnumber', 'item_code');
        const name = extractField(mapped, 'name', 'product_name', 'description', 'item_description');

        if (!sku || !name) {
          errors.push(`Row missing SKU or name: ${JSON.stringify(row)}`);
          continue;
        }

        // Extract countries
        const countriesRaw = extractField(mapped, 'countries', 'regions', 'country', 'region');
        const countries = countriesRaw
          ? countriesRaw.split(/[,;|]+/).map((c) => c.trim()).filter(Boolean)
          : [];

        // Extract family
        const family = extractField(mapped, 'family', 'category', 'product_family', 'product_category');

        // Build specifications from remaining columns
        const knownFields = new Set(['sku', 'part_number', 'name', 'product_name', 'description',
          'item_description', 'family', 'category', 'countries', 'regions', 'country', 'region',
          'product_family', 'product_category', 'item_code', 'partnumber']);

        const specifications: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(mapped)) {
          if (!knownFields.has(key) && val !== null && val !== undefined && val !== '') {
            specifications[key] = val;
          }
        }

        // Fetch existing product
        const { data: existing } = await adminSupabase
          .from('products')
          .select('*')
          .eq('sku', sku)
          .single();

        const productData = {
          sku,
          name,
          description: extractField(mapped, 'description', 'item_description') ?? null,
          family: family ?? null,
          specifications: Object.keys(specifications).length > 0 ? specifications : null,
          countries: countries.length > 0 ? countries : null,
          updated_at: new Date().toISOString(),
        };

        const { data: product, error: upsertError } = await adminSupabase
          .from('products')
          .upsert(productData, { onConflict: 'sku' })
          .select()
          .single();

        if (upsertError || !product) {
          errors.push(`Failed to upsert ${sku}: ${upsertError?.message}`);
          continue;
        }

        upserted++;

        // Check if re-embedding is needed
        const embeddingText = buildProductEmbeddingText(product);
        const hash = contentHash(embeddingText);

        const { data: existingEmbed } = await adminSupabase
          .from('product_embeddings')
          .select('id, content_hash')
          .eq('product_id', product.id)
          .single();

        const needsReembed = !existingEmbed || existingEmbed.content_hash !== hash ||
          !existing || existing.name !== name || existing.description !== productData.description;

        if (needsReembed) {
          const embedding = await embedText(embeddingText);
          const embeddingStr = `[${embedding.join(',')}]`;

          if (existingEmbed) {
            await adminSupabase
              .from('product_embeddings')
              .update({ embedding: embeddingStr, embedded_text: embeddingText, content_hash: hash })
              .eq('id', existingEmbed.id);
          } else {
            await adminSupabase.from('product_embeddings').insert({
              product_id: product.id,
              embedding: embeddingStr,
              embedded_text: embeddingText,
              content_hash: hash,
            });
          }
          reembedded++;
        }
      } catch (rowErr) {
        errors.push(`Row error: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
      }
    }

    return NextResponse.json({
      success: true,
      total_rows: rows.length,
      upserted,
      reembedded,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('SAP import error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Return headers for column mapping UI
export async function GET(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headers = (rows[0] as string[]) ?? [];

    return NextResponse.json({ headers });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
