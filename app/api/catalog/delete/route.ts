import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { deleteFromR2 } from '@/lib/r2';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const document_id = searchParams.get('id');

    if (!document_id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    const { data: doc } = await adminSupabase
      .from('catalog_documents')
      .select('r2_key')
      .eq('id', document_id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from R2
    await deleteFromR2(doc.r2_key);

    // Delete record
    await adminSupabase.from('catalog_documents').delete().eq('id', document_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
