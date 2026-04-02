import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminSupabase = createAdminSupabaseClient();
    const { data } = await adminSupabase
      .from('products')
      .select('family')
      .not('family', 'is', null)
      .eq('is_active', true);

    const families = [...new Set((data ?? []).map((p: { family: string }) => p.family).filter(Boolean))].sort();

    return NextResponse.json({ families });
  } catch (err) {
    console.error('Families error:', err);
    return NextResponse.json({ families: [] });
  }
}
