import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { downloadFromR2 } from '@/lib/r2';
import { extractPdfText, chunkText, extractSkusFromText } from '@/lib/pdf';
import { embedText, buildProductEmbeddingText, buildCatalogChunkText, contentHash } from '@/lib/embeddings';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { document_id } = body;

    if (!document_id) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // Fetch document record
    const { data: doc, error: docError } = await adminSupabase
      .from('catalog_documents')
      .select('*')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Mark as processing
    await adminSupabase
      .from('catalog_documents')
      .update({ status: 'processing' })
      .eq('id', document_id);

    try {
      // Download PDF
      const pdfBuffer = await downloadFromR2(doc.r2_key);

      // Extract text
      const { pages, totalPages } = await extractPdfText(pdfBuffer);

      // Get all known SKUs
      const { data: products } = await adminSupabase
        .from('products')
        .select('id, sku, name, description, family, specifications, countries');

      const allSkus = (products ?? []).map((p) => p.sku);
      const productMap = Object.fromEntries((products ?? []).map((p) => [p.sku, p]));

      // Track which products need re-embedding
      const affectedProducts = new Set<string>();

      for (const page of pages) {
        const chunks = chunkText(page.text, 500, 50, page.pageNumber);

        for (const chunk of chunks) {
          if (!chunk.text.trim()) continue;

          // Find mentioned SKUs
          const mentionedSkus = extractSkusFromText(chunk.text, allSkus);

          const prefixedChunk = buildCatalogChunkText(
            chunk.text,
            doc.product_family ?? 'General',
            doc.countries ?? []
          );

          if (mentionedSkus.length > 0) {
            // Associate chunk with found products
            for (const sku of mentionedSkus) {
              affectedProducts.add(sku);

              // Append chunk text to product's embedded_text
              const product = productMap[sku];
              if (product) {
                const { data: existingEmbed } = await adminSupabase
                  .from('product_embeddings')
                  .select('id, embedded_text')
                  .eq('product_id', product.id)
                  .single();

                const baseText = buildProductEmbeddingText(product);
                const enrichedText = existingEmbed?.embedded_text
                  ? `${existingEmbed.embedded_text}\n\nCatalog context: ${prefixedChunk}`
                  : `${baseText}\n\nCatalog context: ${prefixedChunk}`;

                const hash = contentHash(enrichedText);
                const embedding = await embedText(enrichedText.slice(0, 8000));
                const embeddingStr = `[${embedding.join(',')}]`;

                if (existingEmbed) {
                  await adminSupabase
                    .from('product_embeddings')
                    .update({
                      embedded_text: enrichedText,
                      content_hash: hash,
                      embedding: embeddingStr,
                    })
                    .eq('id', existingEmbed.id);
                } else {
                  await adminSupabase.from('product_embeddings').insert({
                    product_id: product.id,
                    embedded_text: enrichedText,
                    content_hash: hash,
                    embedding: embeddingStr,
                  });
                }
              }
            }
          }
          // Unmatched chunks: stored as general catalog context (no product association needed for now)
        }
      }

      // Update status
      await adminSupabase
        .from('catalog_documents')
        .update({ status: 'completed', page_count: totalPages })
        .eq('id', document_id);

      return NextResponse.json({
        success: true,
        pages_processed: totalPages,
        products_affected: affectedProducts.size,
      });
    } catch (ingestErr) {
      const message = ingestErr instanceof Error ? ingestErr.message : 'Unknown error';
      await adminSupabase
        .from('catalog_documents')
        .update({ status: 'failed', error_message: message })
        .eq('id', document_id);
      throw ingestErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Ingest error:', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
