// Deprecated — replaced by /api/query/search (SQL-first architecture)
export const dynamic = 'force-dynamic';
export async function POST() {
  return Response.json({ error: 'Endpoint deprecated. Use /api/query/search.' }, { status: 410 });
}
// Original code below — kept for reference only
import { NextRequest, NextResponse } from 'next/server';
import { generateClarifications } from '@/lib/claude';
import { createAdminSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query, family } = await req.json() as { query: string; family?: string };
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const adminSupabase = createAdminSupabaseClient();

    // Use first word for a broader name match so we get more product variants
    const firstWord = query.split(' ')[0];

    let dbQuery = adminSupabase
      .from('products')
      .select('name')
      .ilike('name', `%${firstWord}%`)
      .eq('is_active', true);

    if (family) {
      dbQuery = dbQuery.eq('family', family);
    }

    const { data: products } = await dbQuery.limit(40);

    const sampleNames = Array.from(new Set((products ?? []).map((p: { name: string }) => p.name).filter(Boolean)));
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
