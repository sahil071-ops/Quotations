import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { rankProductMatches, generateVariantQuestions, detectLanguage } from '@/lib/claude';
import { enrichQueryWithMetric, extractSpecsFromQuery } from '@/lib/units';
import type { MatchResult, QueryMatchResponse } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { query, country, family, clarificationAnswers, engineer_id } = await req.json() as {
      query: string;
      country?: string;
      family?: string;
      clarificationAnswers?: Record<string, string>;
      engineer_id?: string;
    };

    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const adminSupabase = createAdminSupabaseClient();

    // 1. Build enriched query: unit-convert base query + clarification answers
    const clarificationValues = clarificationAnswers
      ? Object.values(clarificationAnswers).filter(
          (v) => v && v !== 'Not sure' && v !== 'Other (please specify)' && v !== '_skip'
        )
      : [];

    const baseQuery =
      clarificationValues.length > 0
        ? `${query} ${clarificationValues.map(enrichQueryWithMetric).join(' ')}`
        : query;

    const enrichedQuery = enrichQueryWithMetric(baseQuery);

    // 2. Embed + detect language in parallel
    const [queryEmbedding, detectedLanguage] = await Promise.all([
      embedText(enrichedQuery),
      detectLanguage(query).catch(() => 'Unknown'),
    ]);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // 3. Extract specs from query to determine search strategy
    const querySpecs = extractSpecsFromQuery(enrichedQuery);
    const hasSpecs = Object.keys(querySpecs).length > 0;

    // 4. Vector or hybrid search — wide pool of 100 candidates
    let vectorResults, searchError;

    if (hasSpecs) {
      const specFilters = {
        ...(querySpecs.diameter_min != null && { diameter_mm: true, diameter_min: querySpecs.diameter_min, diameter_max: querySpecs.diameter_max }),
        ...(querySpecs.length_min != null && { length_mm: true, length_min: querySpecs.length_min, length_max: querySpecs.length_max }),
        ...(querySpecs.material && { material: querySpecs.material }),
      };

      const result = await adminSupabase.rpc('match_products_hybrid', {
        query_embedding: embeddingStr,
        spec_filters: specFilters,
        family_filter: family || null,
        match_count: 100,
      });
      vectorResults = result.data;
      searchError = result.error;

      // Fall back to standard search if hybrid RPC not yet deployed
      if (searchError?.code === 'PGRST202' || searchError?.message?.includes('match_products_hybrid')) {
        const fallback = await adminSupabase.rpc('match_products', {
          query_embedding: embeddingStr,
          match_count: 100,
        });
        vectorResults = fallback.data;
        searchError = fallback.error;
      }
    } else {
      const result = await adminSupabase.rpc('match_products', {
        query_embedding: embeddingStr,
        match_count: 100,
      });
      vectorResults = result.data;
      searchError = result.error;
    }

    if (searchError) {
      console.error('Vector search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const vectorRows: Array<{ sku: string; distance: number }> = vectorResults ?? [];

    // 4. Fetch full product details for all candidates in one query
    const allSkus = vectorRows.map((r) => r.sku);
    const { data: productRows } = await adminSupabase
      .from('products')
      .select('*')
      .in('sku', allSkus);

    const productMap = Object.fromEntries((productRows ?? []).map((p) => [p.sku, p]));

    // Reconstruct in vector-score order with full details; drop any SKU missing from DB
    let candidates = vectorRows
      .map((r) => productMap[r.sku])
      .filter(Boolean);

    // 5. Family filter
    if (family) {
      candidates = candidates.filter((c) => c.family === family);
    }

    // 6. Competitor cross-ref boost lookup (run in parallel with what we have)
    const { data: crossrefs } = await adminSupabase
      .from('competitor_crossrefs')
      .select('competitor_sku, axis_sku')
      .not('axis_sku', 'is', null);

    const competitorBoostSkus: string[] = [];
    if (crossrefs) {
      const upperQuery = query.toUpperCase();
      for (const ref of crossrefs) {
        if (upperQuery.includes(ref.competitor_sku.toUpperCase()) && ref.axis_sku) {
          competitorBoostSkus.push(ref.axis_sku);
        }
      }
    }

    // 7. Feedback boost lookup
    const { data: feedbackMatches } = await adminSupabase.rpc('match_feedback', {
      query_embedding: embeddingStr,
      similarity_threshold: 0.15,
      match_count: 5,
    });
    const feedbackBoostSkus: string[] =
      feedbackMatches?.map((f: { correct_sku: string }) => f.correct_sku) ?? [];

    // 8. Country tier sort (boost > country tier 0 > no-country > excluded)
    const countryTier = (c: { sku: string; countries?: string[] | null }): number => {
      if (competitorBoostSkus.includes(c.sku) || feedbackBoostSkus.includes(c.sku)) return -1;
      if (!country) return 0;
      const countries = c.countries;
      if (!countries || countries.length === 0) return 1;
      if (countries.includes(country)) return 0;
      return 2;
    };
    candidates.sort((a, b) => countryTier(a) - countryTier(b));

    // 9. Variant family detection — only on the first call (no answers yet)
    const isFirstCall =
      !clarificationAnswers ||
      (Object.keys(clarificationAnswers).length === 0) ||
      clarificationAnswers['_skip'] === 'true';

    const skipClarification = clarificationAnswers?.['_skip'] === 'true';

    if (isFirstCall && !skipClarification && candidates.length >= 3) {
      // Find the dominant product family among the top 30 candidates
      const familyCounts: Record<string, number> = {};
      for (const c of candidates.slice(0, 30)) {
        if (c.family) familyCounts[c.family] = (familyCounts[c.family] || 0) + 1;
      }

      const [dominantFamily, count] =
        Object.entries(familyCounts).sort(([, a], [, b]) => b - a)[0] ?? ['', 0];

      if (count >= 3 && dominantFamily) {
        // Fetch ALL variants in this family to give Claude the full option set
        const { data: allVariants } = await adminSupabase
          .from('products')
          .select('name')
          .eq('family', dominantFamily)
          .eq('is_active', true)
          .limit(100);

        if (allVariants && allVariants.length >= 2) {
          const questions = await generateVariantQuestions(
            allVariants.map((v: { name: string }) => v.name)
          );

          if (questions.length > 0) {
            return NextResponse.json({
              mode: 'clarify',
              questions,
              candidateCount: candidates.length,
            });
          }
        }
      }
    }

    // 10. Claude scoring of top 50 candidates
    const top50 = candidates.slice(0, 50);

    let claudeMatches: Array<{ sku: string; score: number; confidence: string; reasoning: string }> = [];
    try {
      claudeMatches = await rankProductMatches(enrichedQuery, country ?? '', top50, query);
    } catch (err) {
      console.error('Claude ranking failed:', err);
      claudeMatches = top50.slice(0, 10).map((c, i) => ({
        sku: c.sku,
        score: 65 - i * 2,
        confidence: i < 2 ? 'medium' : 'low',
        reasoning: 'AI reasoning unavailable — based on semantic similarity',
      }));
    }

    if (claudeMatches.length === 0) {
      claudeMatches = top50.slice(0, 5).map((c, i) => ({
        sku: c.sku,
        score: 60 - i,
        confidence: 'low',
        reasoning: 'No strong matches found — showing nearest results',
      }));
    }

    // Apply feedback boost overrides
    claudeMatches = claudeMatches.map((m) => {
      if (feedbackBoostSkus.includes(m.sku)) {
        return { ...m, score: 100, confidence: 'high', reasoning: 'Based on previous engineer correction' };
      }
      return m;
    });

    // 11. Build MatchResult list + final country re-rank within each tier
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

    if (country) {
      const finalTier = (sku: string): number => {
        const prod = productMap[sku];
        const countries = prod?.countries;
        if (!countries || countries.length === 0) return 1;
        if (countries.includes(country)) return 0;
        return 2;
      };
      matches.sort((a, b) => {
        const t = finalTier(a.sku) - finalTier(b.sku);
        return t !== 0 ? t : (b.score ?? 0) - (a.score ?? 0);
      });
      matches = matches.map((m, i) => ({ ...m, rank: i + 1 }));
    }

    // 12. Log query
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

    return NextResponse.json({ mode: 'results', ...response });
  } catch (err) {
    console.error('search-then-clarify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
