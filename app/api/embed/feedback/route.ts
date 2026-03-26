import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText, buildProductEmbeddingText, contentHash } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feedback_id, promoted_by } = body;

    if (!feedback_id) {
      return NextResponse.json({ error: 'feedback_id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // Get feedback record
    const { data: feedback } = await adminSupabase
      .from('feedback')
      .select('*')
      .eq('id', feedback_id)
      .single();

    if (!feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    // Get the correct product
    const { data: product } = await adminSupabase
      .from('products')
      .select('*')
      .eq('sku', feedback.correct_sku)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Build enriched embedding text with query as alias
    const baseText = buildProductEmbeddingText(product);
    const enrichedText = `${baseText}\nAlias: ${feedback.raw_query}`;
    const hash = contentHash(enrichedText);

    const embedding = await embedText(enrichedText);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { data: existing } = await adminSupabase
      .from('product_embeddings')
      .select('id, content_hash')
      .eq('product_id', product.id)
      .single();

    if (existing) {
      await adminSupabase
        .from('product_embeddings')
        .update({ embedding: embeddingStr, embedded_text: enrichedText, content_hash: hash })
        .eq('id', existing.id);
    } else {
      await adminSupabase.from('product_embeddings').insert({
        product_id: product.id,
        embedding: embeddingStr,
        embedded_text: enrichedText,
        content_hash: hash,
      });
    }

    // Mark feedback as promoted
    await adminSupabase
      .from('feedback')
      .update({
        promoted_to_index: true,
        promoted_at: new Date().toISOString(),
        promoted_by: promoted_by ?? null,
      })
      .eq('id', feedback_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Embed feedback error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
