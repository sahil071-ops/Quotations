import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { uploadToR2 } from '@/lib/r2';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    // Parse form data first before any other async operations
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const productFamily = formData.get('product_family') as string | null;
    const regionsRaw = formData.get('countries') as string | null;
    const uploaderIdRaw = formData.get('uploader_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const regions = regionsRaw ? JSON.parse(regionsRaw) : [];
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const r2Key = `catalogs/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Upload to R2
    try {
      await uploadToR2(r2Key, fileBuffer, 'application/pdf');
    } catch (r2Err) {
      const msg = r2Err instanceof Error ? r2Err.message : String(r2Err);
      console.error('R2 upload error:', msg);
      return NextResponse.json({ error: `R2 upload failed: ${msg}` }, { status: 500 });
    }

    // Create catalog_documents record
    const adminSupabase = createAdminSupabaseClient();
    const { data: doc, error } = await adminSupabase
      .from('catalog_documents')
      .insert({
        filename: file.name,
        r2_key: r2Key,
        product_family: productFamily ?? null,
        countries: regions,
        status: 'pending',
        uploaded_by: uploaderIdRaw ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Catalog document insert error:', error);
      return NextResponse.json({ error: `DB insert failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ document_id: doc.id, r2_key: r2Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Upload error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
