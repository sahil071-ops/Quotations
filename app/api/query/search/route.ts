import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { rankProductMatches, detectLanguage } from '@/lib/claude';
import { enrichQueryWithMetric, extractSpecsFromQuery } from '@/lib/units';
import type { MatchResult, QueryMatchResponse } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { query, country, family, engineer_id } = await req.json() as {
      query: string;
      country?: string;
      family?: string;
      engineer_id?: string;
    };

    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const adminSupabase = createAdminSupabaseClient();

    // 1. Enrich query with unit conversions
    const enrichedQuery = enrichQueryWithMetric(query);

    // 2. Extract specs + determine query type (synchronous)
    const querySpecs = extractSpecsFromQuery(enrichedQuery);
    const hasSpecs = Object.keys(querySpecs).length > 0;
    console.log('[SEARCH] specs:', querySpecs, '| enriched:', enrichedQuery);

    const queryWords = query.trim().split(/\s+/);
    const isGenericQuery = queryWords.length <= 2 && !hasSpecs;

    // 3. Parallel: embed + detect language + name search (for generic queries)
    const [queryEmbedding, detectedLanguage, nameMatchesResult] = await Promise.all([
      embedText(enrichedQuery),
      detectLanguage(query).catch(() => 'Unknown'),
      isGenericQuery
        ? adminSupabase
            .from('products')
            .select('id, sku, name, family, specifications, countries, description, is_active')
            .ilike('name', `%${query.trim()}%`)
            .eq('is_active', true)
            .limit(500)
        : Promise.resolve({ data: [] as { id: string; sku: string; name: string; family: string | null; specifications: Record<string, unknown> | null; countries: string[] | null; description: string | null; is_active: boolean }[] }),
    ]);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // 4. Vector or hybrid search — 100 candidates
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
      console.error('[SEARCH] Vector search error:', searchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const vectorRows: Array<{ sku: string; distance: number }> = vectorResults ?? [];

    // 5. Fetch full product details for vector candidates
    const allSkus = vectorRows.map((r) => r.sku);
    const productMap: Record<string, Record<string, unknown>> = {};

    if (allSkus.length > 0) {
      const { data: productRows } = await adminSupabase
        .from('products')
        .select('*')
        .in('sku', allSkus);
      (productRows ?? []).forEach((p) => { productMap[p.sku] = p; });
    }

    // Reconstruct in vector-score order with full details
    let candidates: Array<Record<string, unknown>> = vectorRows
      .map((r) => productMap[r.sku] ? { ...productMap[r.sku], distance: r.distance } : null)
      .filter(Boolean) as Array<Record<string, unknown>>;

    // 6. Merge name-search results (for generic queries)
    const nameMatches = nameMatchesResult.data ?? [];
    console.log('[NAME SEARCH] query:', query.trim(), '| total hits:', nameMatches.length);
    console.log('[NAME SEARCH] First 5:', nameMatches.slice(0, 5).map(p => p.name));
    console.log('[NAME SEARCH] Copper bonded count:', nameMatches.filter(p => p.name.toLowerCase().includes('copper bonded')).length);

    if (nameMatches.length > 0) {
      const existingSkus = new Set(candidates.map((c) => c.sku as string));
      nameMatches.forEach((p) => {
        if (!existingSkus.has(p.sku)) {
          const record = { ...p, distance: 0.5 } as Record<string, unknown>; // lower priority than vector hits
          candidates.push(record);
          productMap[p.sku] = record;
          existingSkus.add(p.sku);
        } else {
          // Already in vector results — keep the better (lower) vector distance, just update productMap
          productMap[p.sku] = { ...productMap[p.sku], ...p };
        }
      });
    }

    // 7. Family filter
    if (family) {
      candidates = candidates.filter((c) => c.family === family);
    }

    // 8. SKU prefix expansion — fetch ALL variants of any dominant prefix (3+ hits)
    const prefixCounts: Record<string, number> = {};
    candidates.forEach((c) => {
      const prefix = (c.sku as string).match(/^[A-Z]+\d+/)?.[0];
      if (prefix) prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });

    const expandPrefixes = Object.entries(prefixCounts)
      .filter(([, count]) => count >= 3)
      .map(([prefix]) => prefix);

    if (expandPrefixes.length > 0) {
      const expansionResults = await Promise.all(
        expandPrefixes.map((prefix) =>
          adminSupabase
            .from('products')
            .select('id, sku, name, family, specifications, countries, description, is_active')
            .like('sku', `${prefix}%`)
            .eq('is_active', true)
            .limit(100)
        )
      );

      const existingSkus = new Set(candidates.map((c) => c.sku as string));
      expansionResults.forEach((result) => {
        (result.data || []).forEach((product) => {
          if (!existingSkus.has(product.sku)) {
            const record = { ...product, distance: 0.25 } as Record<string, unknown>;
            candidates.push(record);
            productMap[product.sku] = record;
            existingSkus.add(product.sku);
          }
        });
      });
    }

    // 9. Competitor cross-ref boost lookup
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

    // 10. Feedback boost lookup
    const { data: feedbackMatches } = await adminSupabase.rpc('match_feedback', {
      query_embedding: embeddingStr,
      similarity_threshold: 0.15,
      match_count: 5,
    });
    const feedbackBoostSkus: string[] =
      feedbackMatches?.map((f: { correct_sku: string }) => f.correct_sku) ?? [];

    // 11. Country tier sort
    const countryTier = (c: Record<string, unknown>): number => {
      const sku = c.sku as string;
      if (competitorBoostSkus.includes(sku) || feedbackBoostSkus.includes(sku)) return -1;
      if (!country) return 0;
      const countries = c.countries as string[] | null | undefined;
      if (!countries || countries.length === 0) return 1;
      if (countries.includes(country)) return 0;
      return 2;
    };
    candidates.sort((a, b) => countryTier(a) - countryTier(b));

    // 12. For generic queries with many results, skip Claude and rank by vector distance
    if (isGenericQuery && candidates.length >= 50) {
      const sorted = candidates
        .slice()
        .sort((a, b) => {
          const tierDiff = countryTier(a) - countryTier(b);
          if (tierDiff !== 0) return tierDiff;
          return ((a.distance as number) || 0.5) - ((b.distance as number) || 0.5);
        })
        .slice(0, 300);

      const matches: MatchResult[] = sorted.map((p, i) => {
        const dist = (p.distance as number) || 0.5;
        const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 100)));
        return {
          rank: i + 1,
          sku: p.sku as string,
          name: (p.name as string) ?? (p.sku as string),
          confidence: dist < 0.2 ? 'high' : dist < 0.35 ? 'medium' : 'low',
          reasoning: 'Matched by product name — use filter chips to narrow down',
          score,
          family: (p.family as string) ?? null,
          specifications: (p.specifications as Record<string, unknown>) ?? null,
          description: (p.description as string) ?? null,
        };
      });

      const { data: queryLog } = await adminSupabase
        .from('queries')
        .insert({ engineer_id: engineer_id ?? null, raw_query: query, detected_language: detectedLanguage, country_context: country ?? null, top_matches: matches })
        .select('id')
        .single();

      const response: QueryMatchResponse = {
        query_id: queryLog?.id ?? '',
        detected_language: detectedLanguage,
        matches,
        total: matches.length,
      };
      return NextResponse.json({ mode: 'results', ...response });
    }

    // 13. Claude ranking for specific queries or small candidate sets
    const top50 = candidates.slice(0, 50);

    // Use Haiku when all candidates share the same SKU prefix (simple variant ranking)
    const firstPrefix = (top50[0]?.sku as string)?.match(/^[A-Z]+\d+/)?.[0];
    const allSamePrefix = !!firstPrefix && top50.every(
      (c) => (c.sku as string).match(/^[A-Z]+\d+/)?.[0] === firstPrefix
    );
    const rankingModel = allSamePrefix
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-20250514';

    let claudeMatches: Array<{ sku: string; score: number; confidence: string; reasoning: string }> = [];
    try {
      claudeMatches = await rankProductMatches(enrichedQuery, country ?? '', top50 as Parameters<typeof rankProductMatches>[2], query, rankingModel);
    } catch (err) {
      console.error('[SEARCH] Claude ranking failed:', err);
      claudeMatches = top50.slice(0, 10).map((c, i) => ({
        sku: c.sku as string,
        score: 65 - i * 2,
        confidence: i < 2 ? 'medium' : 'low',
        reasoning: 'AI reasoning unavailable — based on semantic similarity',
      }));
    }

    if (claudeMatches.length === 0) {
      claudeMatches = top50.slice(0, 5).map((c, i) => ({
        sku: c.sku as string,
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

    // 14. Build MatchResult list + final country re-rank
    let matches: MatchResult[] = claudeMatches.map((m, i) => {
      const product = productMap[m.sku];
      return {
        rank: i + 1,
        sku: m.sku,
        name: (product?.name as string) ?? m.sku,
        confidence: m.confidence as 'high' | 'medium' | 'low',
        reasoning: m.reasoning,
        score: m.score,
        family: (product?.family as string) ?? null,
        specifications: (product?.specifications as Record<string, unknown>) ?? null,
        description: (product?.description as string) ?? null,
      };
    });

    if (country) {
      const finalTier = (sku: string): number => {
        const prod = productMap[sku];
        const countries = prod?.countries as string[] | null | undefined;
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

    // 15. Log query
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
    console.error('[SEARCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
