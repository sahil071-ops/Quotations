import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText, buildProductEmbeddingText, contentHash } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const batchSize: number = body.batchSize ?? 50;
    const offset: number = body.offset ?? 0;

    const adminSupabase = createAdminSupabaseClient();

    // Fetch a page of active products
    const { data: products, error: fetchError } = await adminSupabase
      .from('products')
      .select('id, sku, name, description, family, specifications, countries')
      .eq('is_active', true)
      .range(offset, offset + batchSize - 1);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ done: true, embedded: 0, nextOffset: null });
    }

    // Find which products in this batch already have up-to-date embeddings
    const productIds = products.map((p) => p.id);
    const { data: existingEmbeds } = await adminSupabase
      .from('product_embeddings')
      .select('product_id, content_hash')
      .in('product_id', productIds);

    const existingHashMap = new Map(
      (existingEmbeds ?? []).map((e) => [e.product_id, e.content_hash])
    );

    let embedded = 0;

    for (const product of products) {
      try {
        const text = buildProductEmbeddingText(product);
        const hash = contentHash(text);

        // Skip if content hasn't changed
        if (existingHashMap.get(product.id) === hash) continue;

        const embedding = await embedText(text);
        const embeddingStr = `[${embedding.join(',')}]`;

        if (existingHashMap.has(product.id)) {
          await adminSupabase
            .from('product_embeddings')
            .update({ embedding: embeddingStr, embedded_text: text, content_hash: hash })
            .eq('product_id', product.id);
        } else {
          await adminSupabase.from('product_embeddings').insert({
            product_id: product.id,
            embedding: embeddingStr,
            embedded_text: text,
            content_hash: hash,
          });
        }
        embedded++;
      } catch (embErr) {
        console.error(`Failed to embed ${product.sku}:`, embErr);
      }
    }

    const isLastBatch = products.length < batchSize;

    return NextResponse.json({
      done: isLastBatch,
      embedded,
      skipped: products.length - embedded,
      nextOffset: isLastBatch ? null : offset + batchSize,
      progress: { processed: offset + products.length, batchSize },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
