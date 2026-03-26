import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { rankProductMatches, detectLanguage } from '@/lib/claude';
import type { MatchResult, QueryMatchResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, country, engineer_id } = body as {
      query: string;
      country: string;
      engineer_id: string;
    };

    if (!query || !country) {
      return NextResponse.json({ error: 'query and country are required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const adminSupabase = createAdminSupabaseClient();

    // 1. Detect language
    let detectedLanguage = 'Unknown';
    try {
      detectedLanguage = await detectLanguage(query);
    } catch {
      // Non-critical — continue
    }

    // 2. Check competitor cross-refs for any part numbers in query
    const competitorBoosts: string[] = [];
    const { data: crossrefs } = await adminSupabase
      .from('competitor_crossrefs')
      .select('competitor_sku, axis_sku, confidence')
      .not('axis_sku', 'is', null);

    if (crossrefs) {
      const upperQuery = query.toUpperCase();
      for (const ref of crossrefs) {
        if (upperQuery.includes(ref.competitor_sku.toUpperCase()) && ref.axis_sku) {
          competitorBoosts.push(ref.axis_sku);
        }
      }
    }

    // 3. Embed the query
    const queryEmbedding = await embedText(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // 4. Check feedback table for similar past corrections
    const { data: feedbackMatches } = await adminSupabase.rpc('match_feedback', {
      query_embedding: embeddingStr,
      similarity_threshold: 0.15,
      match_count: 5,
    });

    const feedbackBoostSkus: string[] = feedbackMatches?.map(
      (f: { correct_sku: string }) => f.correct_sku
    ) ?? [];

    // 5. Vector search
    const { data: vectorResults, error: searchError } = await adminSupabase.rpc('match_products', {
      query_embedding: embeddingStr,
      country_filter: country,
      match_count: 10,
    });

    if (searchError) {
      console.error('Vector search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    let candidates = vectorResults ?? [];

    // 6. Boost competitor SKUs and feedback corrections to top
    const boostedSkus = Array.from(new Set([...competitorBoosts, ...feedbackBoostSkus]));
    candidates.sort((a: { sku: string; distance: number }, b: { sku: string; distance: number }) => {
      const aBoost = boostedSkus.includes(a.sku) ? -1 : 0;
      const bBoost = boostedSkus.includes(b.sku) ? -1 : 0;
      if (aBoost !== bBoost) return aBoost - bBoost;
      return a.distance - b.distance;
    });

    // 7. Ask Claude to rank and reason
    let claudeMatches: Array<{ sku: string; confidence: string; reasoning: string }> = [];
    try {
      claudeMatches = await rankProductMatches(query, country, candidates.slice(0, 10));
    } catch (err) {
      console.error('Claude ranking failed:', err);
      // Fall back to pure vector results
      claudeMatches = candidates.slice(0, 3).map((c: { sku: string }, i: number) => ({
        sku: c.sku,
        confidence: i === 0 ? 'medium' : 'low',
        reasoning: 'AI reasoning unavailable — based on semantic similarity',
      }));
    }

    // 8. Override reasoning for feedback-boosted results
    claudeMatches = claudeMatches.map((m) => {
      if (feedbackBoostSkus.includes(m.sku)) {
        return { ...m, confidence: 'high', reasoning: 'Based on previous engineer correction' };
      }
      return m;
    });

    // 9. Fetch full product details for top matches
    const topSkus = claudeMatches.map((m) => m.sku);
    const { data: products } = await adminSupabase
      .from('products')
      .select('*')
      .in('sku', topSkus);

    const productMap = Object.fromEntries((products ?? []).map((p) => [p.sku, p]));

    const matches: MatchResult[] = claudeMatches.map((m, i) => {
      const product = productMap[m.sku];
      return {
        rank: i + 1,
        sku: m.sku,
        name: product?.name ?? m.sku,
        confidence: m.confidence as 'high' | 'medium' | 'low',
        reasoning: m.reasoning,
        family: product?.family ?? null,
        specifications: product?.specifications ?? null,
        description: product?.description ?? null,
      };
    });

    // 10. Log query
    const { data: queryLog } = await adminSupabase
      .from('queries')
      .insert({
        engineer_id: engineer_id ?? null,
        raw_query: query,
        detected_language: detectedLanguage,
        country_context: country,
        top_matches: matches,
      })
      .select('id')
      .single();

    const response: QueryMatchResponse = {
      query_id: queryLog?.id ?? '',
      detected_language: detectedLanguage,
      matches,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Match error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
