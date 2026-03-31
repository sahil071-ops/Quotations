import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const XLSX = await import('xlsx');
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Read as raw arrays so we can inspect the structure before deciding format
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
    }) as string[][];

    const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell).trim() !== ''));

    if (nonEmptyRows.length === 0) {
      return NextResponse.json({ error: 'File appears to be empty' }, { status: 400 });
    }

    const headerRow = nonEmptyRows[0].map((h) => String(h).trim());
    const firstHeader = headerRow[0].toLowerCase();

    type CrossRef = {
      competitor_name: string;
      competitor_sku: string;
      axis_sku: string;
      confidence: string;
    };

    const crossrefs: CrossRef[] = [];

    // ── HORIZONTAL FORMAT ──────────────────────────────────────────────────
    // First cell is "AXIS" — remaining header cells are competitor names.
    // Each data row: col 0 = Axis SKU, col 1+ = that competitor's equivalent SKU.
    if (firstHeader === 'axis' || firstHeader === 'axis sku' || firstHeader === 'axis_sku') {
      const competitorNames = headerRow.slice(1).filter((n) => n !== '');

      for (let i = 1; i < nonEmptyRows.length; i++) {
        const row = nonEmptyRows[i];
        const axisSku = String(row[0] ?? '').trim();
        if (!axisSku) continue; // spacer rows

        for (let c = 0; c < competitorNames.length; c++) {
          const competitorSku = String(row[c + 1] ?? '').trim();
          if (!competitorSku) continue; // no equivalent for this competitor

          crossrefs.push({
            competitor_name: competitorNames[c],
            competitor_sku: competitorSku,
            axis_sku: axisSku,
            confidence: 'high', // direct manufacturer cross-ref
          });
        }
      }

    // ── VERTICAL FORMAT ────────────────────────────────────────────────────
    // Expects columns: competitor_name, competitor_sku, axis_sku (+ optional confidence, notes)
    } else {
      const colMap: Record<string, number> = {};
      headerRow.forEach((h, i) => {
        colMap[h.toLowerCase().replace(/[\s-]/g, '_')] = i;
      });

      const competitorNameCol = colMap['competitor_name'] ?? colMap['competitor'] ?? null;
      const competitorSkuCol = colMap['competitor_sku'] ?? colMap['competitor_part'] ?? null;
      const axisSkuCol = colMap['axis_sku'] ?? colMap['axis'] ?? colMap['our_sku'] ?? null;

      if (competitorNameCol === null || competitorSkuCol === null || axisSkuCol === null) {
        return NextResponse.json({
          error:
            `Could not identify required columns. Found: ${headerRow.join(', ')}. ` +
            `Expected either: (1) horizontal format — first column header "AXIS", remaining headers = competitor names; ` +
            `or (2) vertical format — columns named competitor_name, competitor_sku, axis_sku.`,
        }, { status: 400 });
      }

      for (let i = 1; i < nonEmptyRows.length; i++) {
        const row = nonEmptyRows[i];
        const competitorName = String(row[competitorNameCol] ?? '').trim();
        const competitorSku = String(row[competitorSkuCol] ?? '').trim();
        const axisSku = String(row[axisSkuCol] ?? '').trim();
        const rawConfidence = String(row[colMap['confidence']] ?? '').trim().toLowerCase();
        const confidence = ['high', 'medium', 'low'].includes(rawConfidence) ? rawConfidence : 'medium';

        if (!competitorName || !competitorSku || !axisSku) continue;

        crossrefs.push({ competitor_name: competitorName, competitor_sku: competitorSku, axis_sku: axisSku, confidence });
      }
    }

    if (crossrefs.length === 0) {
      return NextResponse.json({
        error: 'No valid cross-reference rows found. Ensure the first cell is "AXIS" and at least one competitor column has data.',
      }, { status: 400 });
    }

    // Upsert in batches of 500
    const adminSupabase = createAdminSupabaseClient();
    const BATCH_SIZE = 500;
    let totalUpserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < crossrefs.length; i += BATCH_SIZE) {
      const batch = crossrefs.slice(i, i + BATCH_SIZE);
      const { error } = await adminSupabase
        .from('competitor_crossrefs')
        .upsert(batch, { onConflict: 'competitor_name,competitor_sku' });

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        totalUpserted += batch.length;
      }
    }

    const competitorCount = new Set(crossrefs.map((r) => r.competitor_name)).size;

    return NextResponse.json({
      success: true,
      imported: totalUpserted,
      total: crossrefs.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${totalUpserted} cross-references imported across ${competitorCount} competitor${competitorCount !== 1 ? 's' : ''}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[CrossRef Import Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
