// Deprecated — replaced by /api/query/search (SQL-first architecture)
export const dynamic = 'force-dynamic';
export async function POST() {
  return Response.json({ error: 'Endpoint deprecated. Use /api/query/search.' }, { status: 410 });
}
