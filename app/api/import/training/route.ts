import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import * as XLSX from 'xlsx';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingRaw = formData.get('column_mapping') as string | null;

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!mappingRaw) return NextResponse.json({ error: 'column_mapping is required' }, { status: 400 });

    const mapping: { query: string; sku: string; region?: string; notes?: string } = JSON.parse(mappingRaw);
    if (!mapping.query || !mapping.sku)
      return NextResponse.json({ error: 'query and sku mappings are required' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawRows.length === 0) return NextResponse.json({ error: 'No rows found' }, { status: 400 });

    const rows = rawRows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) normalized[normalizeKey(k)] = v;
      return normalized;
    });

    const queryKey = normalizeKey(mapping.query);
    const skuKey = normalizeKey(mapping.sku);
    const regionKey = mapping.region ? normalizeKey(mapping.region) : null;
    const notesKey = mapping.notes ? normalizeKey(mapping.notes) : null;

    const adminSupabase = createAdminSupabaseClient();
    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const rawQuery = String(row[queryKey] ?? '').trim();
      const correctSku = String(row[skuKey] ?? '').trim();

      if (!rawQuery || !correctSku) {
        errors.push(`Skipped — missing query or SKU: ${JSON.stringify(row)}`);
        continue;
      }

      const { error } = await adminSupabase.from('feedback').insert({
        raw_query: rawQuery,
        correct_sku: correctSku,
        country_context: regionKey && row[regionKey] ? String(row[regionKey]) : null,
        correction_notes: notesKey && row[notesKey] ? String(row[notesKey]) : null,
        promoted_to_index: true,
      });

      if (error) {
        errors.push(`SKU ${correctSku}: ${error.message}`);
      } else {
        imported++;
      }
    }

    return NextResponse.json({ success: true, total_rows: rows.length, imported, errors: errors.slice(0, 20) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

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
