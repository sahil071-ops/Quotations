import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { rankProductMatches, detectLanguage } from '@/lib/claude';
import type { MatchResult, QueryMatchResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, country, engineer_id, clarificationAnswers, family } = body as {
      query: string;
      country?: string;
      engineer_id: string;
      clarificationAnswers?: Record<string, string>;
      family?: string;
    };

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    // Build enriched query — append clarification answers, skip non-values
    const enrichedQuery =
      clarificationAnswers && Object.keys(clarificationAnswers).length > 0
        ? `${query} ${Object.values(clarificationAnswers)
            .filter((v) => v && v !== 'Not sure' && v !== 'Other (please specify)')
            .join(' ')}`.trim()
        : query;

    const adminSupabase = createAdminSupabaseClient();

    // 1. Detect language (uses original query)
    let detectedLanguage = 'Unknown';
    try {
      detectedLanguage = await detectLanguage(query);
    } catch {
      // Non-critical
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

    // 3. Embed the enriched query
    const queryEmbedding = await embedText(enrichedQuery);
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

    // 5. Vector search — 50 candidates to give Claude a wide pool
    const { data: vectorResults, error: searchError } = await adminSupabase.rpc('match_products', {
      query_embedding: embeddingStr,
      match_count: 50,
    });

    if (searchError) {
      console.error('Vector search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    let candidates: Array<{ sku: string; distance: number }> = vectorResults ?? [];

    // 5b. Filter by family if provided
    if (family) {
      const { data: familySkus } = await adminSupabase
        .from('products')
        .select('sku')
        .eq('family', family);
      const familySkuSet = new Set((familySkus ?? []).map((p: { sku: string }) => p.sku));
      candidates = candidates.filter((c) => familySkuSet.has(c.sku));
    }

    // 6. Boost competitor SKUs and feedback corrections to top
    const boostedSkus = Array.from(new Set([...competitorBoosts, ...feedbackBoostSkus]));
    candidates.sort((a, b) => {
      const aBoost = boostedSkus.includes(a.sku) ? -1 : 0;
      const bBoost = boostedSkus.includes(b.sku) ? -1 : 0;
      if (aBoost !== bBoost) return aBoost - bBoost;
      return a.distance - b.distance;
    });

    // 7. Fetch full product details for all candidates (needed for Claude + final result)
    const candidateSkus = candidates.map((c) => c.sku);
    const { data: candidateProducts } = await adminSupabase
      .from('products')
      .select('*')
      .in('sku', candidateSkus);

    const productMap = Object.fromEntries((candidateProducts ?? []).map((p) => [p.sku, p]));

    const candidatesWithDetails = candidates
      .slice(0, 50)
      .map((c) => {
        const p = productMap[c.sku];
        return {
          sku: c.sku,
          name: p?.name ?? c.sku,
          description: p?.description ?? null,
          family: p?.family ?? null,
          specifications: p?.specifications ?? null,
        };
      });

    // 8. Ask Claude to score candidates — returns all with score ≥ 60
    let claudeMatches: Array<{ sku: string; score: number; confidence: string; reasoning: string }> = [];
    try {
      claudeMatches = await rankProductMatches(enrichedQuery, country ?? '', candidatesWithDetails);
    } catch (err) {
      console.error('Claude ranking failed:', err);
      claudeMatches = candidates.slice(0, 10).map((c, i) => ({
        sku: c.sku,
        score: 65 - i * 2,
        confidence: i < 2 ? 'medium' : 'low',
        reasoning: 'AI reasoning unavailable — based on semantic similarity',
      }));
    }

    // Fallback: if Claude returned nothing, show top vector results
    if (claudeMatches.length === 0) {
      claudeMatches = candidates.slice(0, 5).map((c, i) => ({
        sku: c.sku,
        score: 60 - i,
        confidence: 'low',
        reasoning: 'No strong matches found — showing nearest results',
      }));
    }

    // 9. Override for feedback-boosted results
    claudeMatches = claudeMatches.map((m) => {
      if (feedbackBoostSkus.includes(m.sku)) {
        return { ...m, score: 100, confidence: 'high', reasoning: 'Based on previous engineer correction' };
      }
      return m;
    });

    let matches: MatchResult[] = claudeMatches.map((m, i) => {
      const product = productMap[m.sku];
      return {
        rank: i + 1,
        sku: m.sku,
        name: product?.name ?? m.sku,
        confidence: m.confidence as 'high' | 'medium' | 'low',
        reasoning: m.reasoning,
        score: m.score,
        family: product?.family ?? null,
        specifications: product?.specifications ?? null,
        description: product?.description ?? null,
      };
    });

    // 9b. Country tier re-ranking (stable — preserves score order within each tier)
    if (country) {
      const countryTier = (sku: string): number => {
        const prod = productMap[sku];
        const countries = prod?.countries;
        if (!countries || countries.length === 0) return 1;
        if (countries.includes(country)) return 0;
        return 2;
      };
      matches.sort((a, b) => {
        const tierDiff = countryTier(a.sku) - countryTier(b.sku);
        if (tierDiff !== 0) return tierDiff;
        return (b.score ?? 0) - (a.score ?? 0); // preserve score order within tier
      });
      matches = matches.map((m, i) => ({ ...m, rank: i + 1 }));
    }

    // 10. Log query
    const { data: queryLog } = await adminSupabase
      .from('queries')
      .insert({
        engineer_id: engineer_id ?? null,
        raw_query: query,
        detected_language: detectedLanguage,
        country_context: country ?? null,
        top_matches: matches,
      })
      .select('id')
      .single();

    const response: QueryMatchResponse = {
      query_id: queryLog?.id ?? '',
      detected_language: detectedLanguage,
      matches,
      total: matches.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Match error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
