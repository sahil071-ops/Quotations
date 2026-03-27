import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export async function GET() {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('product_categories')
    .select('main_category, sub_category')
    .order('main_category')
    .order('sub_category');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { main_category, sub_category } = await req.json();
  if (!main_category?.trim() || !sub_category?.trim())
    return NextResponse.json({ error: 'main_category and sub_category required' }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('product_categories').insert({
    main_category: main_category.trim(),
    sub_category: sub_category.trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { main_category, sub_category } = await req.json();
  const admin = createAdminSupabaseClient();
  let query = admin.from('product_categories').delete();
  if (sub_category) {
    query = query.eq('main_category', main_category).eq('sub_category', sub_category) as typeof query;
  } else {
    query = query.eq('main_category', main_category) as typeof query;
  }
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
