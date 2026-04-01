// Deprecated — classification removed in favour of always-clarify flow.
// Stub kept so any cached client calls don't 404.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ mode: 'specific' });
}
