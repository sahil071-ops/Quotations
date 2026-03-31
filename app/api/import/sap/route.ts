import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const XLSX = await import('xlsx');
    const { searchParams } = new URL(req.url);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Headers-only mode: return column names for the mapping UI
    if (searchParams.get('headers') === '1') {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      const headers = (rows[0] as string[]) ?? [];
      return NextResponse.json({ headers });
    }

    const mappingRaw = formData.get('column_mapping') as string | null;
    const mapping: Record<string, string> = mappingRaw ? JSON.parse(mappingRaw) : {};

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    // Normalize all column keys
    const rows: Record<string, unknown>[] = rawRows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        normalized[normalizeKey(key)] = val;
      }
      return normalized;
    });

    // Build product records — NO embedding in this step
    const knownFields = new Set([
      'sku', 'part_number', 'name', 'product_name', 'description', 'item_description',
      'family', 'category', 'countries', 'regions', 'country', 'region',
      'product_family', 'product_category', 'item_code', 'partnumber',
    ]);

    const products: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const mapped: Record<string, unknown> = { ...row };
      for (const [target, source] of Object.entries(mapping)) {
        if (row[source] !== undefined) mapped[target] = row[source];
      }

      const sku = extractField(mapped, 'sku', 'part_number', 'partnumber', 'item_code');
      const name = extractField(mapped, 'name', 'product_name', 'description', 'item_description');

      if (!sku || !name) {
        errors.push(`Skipped row — missing SKU or name: ${JSON.stringify(row).slice(0, 120)}`);
        continue;
      }

      const countriesRaw = extractField(mapped, 'countries', 'regions', 'country', 'region');
      const countries = countriesRaw
        ? countriesRaw.split(/[,;|]+/).map((c) => c.trim()).filter(Boolean)
        : null;

      const family = extractField(mapped, 'family', 'category', 'product_family', 'product_category');

      const specifications: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(mapped)) {
        if (!knownFields.has(key) && val !== null && val !== undefined && val !== '') {
          specifications[key] = val;
        }
      }

      products.push({
        sku,
        name,
        description: extractField(mapped, 'description', 'item_description') ?? null,
        family: family ?? null,
        specifications: Object.keys(specifications).length > 0 ? specifications : null,
        countries,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }

    if (products.length === 0) {
      return NextResponse.json({ error: 'No valid rows found. Check column mapping.' }, { status: 400 });
    }

    // Upsert in batches of 500 to avoid Supabase payload limits
    const adminSupabase = createAdminSupabaseClient();
    const BATCH_SIZE = 500;
    let upserted = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await adminSupabase
        .from('products')
        .upsert(batch, { onConflict: 'sku' });

      if (upsertError) {
        return NextResponse.json(
          { error: `DB upsert failed at batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertError.message}` },
          { status: 500 }
        );
      }
      upserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      total_rows: rawRows.length,
      upserted,
      skipped: rawRows.length - upserted,
      errors: errors.slice(0, 20),
      embeddingRequired: true,
      message: `${upserted} products saved. Run "Generate Embeddings" to make them searchable.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error('[SAP Import Error]', message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST ?headers=1 to fetch headers' }, { status: 405 });
}
