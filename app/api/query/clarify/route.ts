import { NextRequest, NextResponse } from 'next/server';
import { generateClarifications } from '@/lib/claude';
import { createAdminSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const adminSupabase = createAdminSupabaseClient();
    const { data: products } = await adminSupabase
      .from('products')
      .select('name')
      .ilike('name', `%${query}%`)
      .limit(20);

    const sampleNames = (products ?? []).map((p: { name: string }) => p.name).filter(Boolean);
    const questions = await generateClarifications(query, sampleNames);

    if (questions.length === 0) {
      return NextResponse.json({ questions: [], fallbackToSearch: true });
    }

    return NextResponse.json({ questions });
  } catch (err) {
    console.error('Clarify error:', err);
    return NextResponse.json({ questions: [], fallbackToSearch: true });
  }
}
