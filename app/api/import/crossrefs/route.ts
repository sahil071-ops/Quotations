import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '_').trim();
}

export async function POST(req: NextRequest) {
  try {
    const XLSX = await import('xlsx');
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const rows = rawRows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        normalized[normalizeKey(key)] = val;
      }
      return normalized;
    });

    const adminSupabase = createAdminSupabaseClient();
    let upserted = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const competitorName = (row['competitor_name'] ?? row['competitor'] ?? '') as string;
      const competitorSku = (row['competitor_sku'] ?? row['competitor_part'] ?? row['competitor_part_number'] ?? '') as string;
      const axisSku = (row['axis_sku'] ?? row['axis_part'] ?? row['axis_part_number'] ?? '') as string;
      const confidence = (row['confidence'] ?? 'medium') as string;
      const notes = (row['notes'] ?? '') as string;

      if (!competitorName?.trim() || !competitorSku?.trim()) {
        errors.push(`Row missing competitor_name or competitor_sku`);
        continue;
      }

      const validConfidence = ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium';

      const { error } = await adminSupabase
        .from('competitor_crossrefs')
        .upsert(
          {
            competitor_name: competitorName.trim(),
            competitor_sku: competitorSku.trim(),
            axis_sku: axisSku?.trim() || null,
            confidence: validConfidence,
            notes: notes?.trim() || null,
          },
          { onConflict: 'competitor_name,competitor_sku' }
        );

      if (error) {
        errors.push(`Failed to upsert ${competitorName}/${competitorSku}: ${error.message}`);
      } else {
        upserted++;
      }
    }

    return NextResponse.json({
      success: true,
      total_rows: rows.length,
      upserted,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Crossref import error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
