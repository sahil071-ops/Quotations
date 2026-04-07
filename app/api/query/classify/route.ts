// Deprecated — replaced by /api/query/search (SQL-first architecture)
export const dynamic = 'force-dynamic';
export async function POST() {
  return Response.json({ error: 'Endpoint deprecated. Use /api/query/search.' }, { status: 410 });
}
// Original code below — kept for reference only
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ mode: 'specific' });
}
