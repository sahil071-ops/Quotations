import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 25;
    const offset = (page - 1) * pageSize;

    const adminSupabase = createAdminSupabaseClient();

    let query = adminSupabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (q) {
      // Normalise both forms: "2400mm" and "2400 mm" should match the same products
      const normalised = q.replace(/(\d+)\s+(mm|cm|m|kg|a|v|w|kv|mv)\b/gi, '$1$2');
      const spaced = q.replace(/(\d+)(mm|cm|m\b|kg\b|[avwk][mv]?\b)/gi, '$1 $2');
      const terms = Array.from(new Set([q, normalised, spaced]));
      const orClauses = terms.flatMap((t) => [
        `sku.ilike.%${t}%`,
        `name.ilike.%${t}%`,
        `family.ilike.%${t}%`,
      ]);
      query = query.or(orClauses.join(','));
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data ?? [], total: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
