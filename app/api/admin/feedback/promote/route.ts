import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { feedback_ids } = body as { feedback_ids: string[] };

    if (!feedback_ids?.length) {
      return NextResponse.json({ error: 'feedback_ids is required' }, { status: 400 });
    }

    const results = [];
    for (const feedback_id of feedback_ids) {
      const res = await fetch(new URL('/api/embed/feedback', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_id, promoted_by: user.id }),
      });
      const data = await res.json();
      results.push({ feedback_id, ...data });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Promote error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
