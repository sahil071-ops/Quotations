import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText, buildProductEmbeddingText, contentHash } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { product_id, sku } = body;

    if (!product_id && !sku) {
      return NextResponse.json({ error: 'product_id or sku is required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    const query = adminSupabase.from('products').select('*');
    const { data: product } = await (product_id
      ? query.eq('id', product_id).single()
      : query.eq('sku', sku).single());

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const embeddingText = buildProductEmbeddingText(product);
    const hash = contentHash(embeddingText);
    const embedding = await embedText(embeddingText);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { data: existing } = await adminSupabase
      .from('product_embeddings')
      .select('id')
      .eq('product_id', product.id)
      .single();

    if (existing) {
      await adminSupabase
        .from('product_embeddings')
        .update({ embedding: embeddingStr, embedded_text: embeddingText, content_hash: hash })
        .eq('id', existing.id);
    } else {
      await adminSupabase.from('product_embeddings').insert({
        product_id: product.id,
        embedding: embeddingStr,
        embedded_text: embeddingText,
        content_hash: hash,
      });
    }

    return NextResponse.json({ success: true, sku: product.sku });
  } catch (err) {
    console.error('Embed product error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
