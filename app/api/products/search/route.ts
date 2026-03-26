import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const limit = parseInt(searchParams.get('limit') ?? '10');

    const adminSupabase = createAdminSupabaseClient();

    const { data: products, error } = await adminSupabase
      .from('products')
      .select('id, sku, name, family, description')
      .or(`sku.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: products ?? [] });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
