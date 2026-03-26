import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase';
import { uploadToR2 } from '@/lib/r2';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const productFamily = formData.get('product_family') as string | null;
    const countriesRaw = formData.get('countries') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const countries = countriesRaw ? JSON.parse(countriesRaw) : [];
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const r2Key = `catalogs/${randomUUID()}-${file.name}`;

    // Upload to R2
    await uploadToR2(r2Key, fileBuffer, 'application/pdf');

    // Create catalog_documents record
    const adminSupabase = createAdminSupabaseClient();
    const { data: doc, error } = await adminSupabase
      .from('catalog_documents')
      .insert({
        filename: file.name,
        r2_key: r2Key,
        product_family: productFamily ?? null,
        countries,
        status: 'pending',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Catalog document insert error:', error);
      return NextResponse.json({ error: 'Failed to create catalog record' }, { status: 500 });
    }

    return NextResponse.json({ document_id: doc.id, r2_key: r2Key });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
