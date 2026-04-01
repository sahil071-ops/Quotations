import { NextRequest, NextResponse } from 'next/server';
import { classifyQuery } from '@/lib/claude';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });
    const mode = await classifyQuery(query);
    return NextResponse.json({ mode });
  } catch (err) {
    console.error('Classify error:', err);
    return NextResponse.json({ mode: 'specific' }); // fail open
  }
}
