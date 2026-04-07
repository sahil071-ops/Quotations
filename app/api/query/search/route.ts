import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseQuery, type ParsedQuery } from '@/lib/query-parser';
import type { MatchResult } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { query, country, family, engineer_id } = await req.json() as {
      query: string;
      country?: string;
      family?: string;
      engineer_id?: string;
    };

    if (!query?.trim()) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const parsed = parseQuery(query);
    console.log('[SEARCH] parsed:', JSON.stringify(parsed));

    let matches: MatchResult[] = [];
    let searchMode = 'sql';

    // ── Step 1: Competitor reference lookup ───────────────────────────────
    if (parsed.isCompetitorQuery && parsed.competitorRef) {
      const xrefMatches = await competitorRefSearch(supabase, parsed.competitorRef, family);
      if (xrefMatches.length > 0) {
        matches = xrefMatches;
        searchMode = 'crossref';
      }
    }

    // ── Step 2: SQL spec search (progressive fallback) ────────────────────
    if (matches.length === 0) {
      const sqlResults = await sqlSpecSearch(supabase, parsed, family, country);
      if (sqlResults.length > 0) {
        matches = sqlResults;
        searchMode = sqlResults[0]._source ?? 'sql';
      }
    }

    // ── Step 3: Vector fallback for truly ambiguous queries ───────────────
    if (matches.length === 0) {
      const { embedText } = await import('@/lib/embeddings');
      const embedding = await embedText(query);
      const embeddingStr = `[${embedding.join(',')}]`;

      const { data: vectorResults } = await supabase.rpc('match_products', {
        query_embedding: embeddingStr,
        match_count: 50,
      });

      if (vectorResults && vectorResults.length > 0) {
        const skus = (vectorResults as Array<{ sku: string; distance: number }>).map(r => r.sku);
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .in('sku', skus)
          .eq('is_active', true);

        const distMap = Object.fromEntries(
          (vectorResults as Array<{ sku: string; distance: number }>).map(r => [r.sku, r.distance])
        );

        matches = ((products ?? []) as Array<Record<string, unknown>>)
          .filter(p => !family || p.family === family)
          .slice(0, 30)
          .map((p, i) => ({
            rank: i + 1,
            sku: p.sku as string,
            name: (p.name as string) ?? (p.sku as string),
            confidence: 'low' as const,
            reasoning: 'No strong matches found — showing nearest results',
            score: 50,
            family: (p.family as string) ?? null,
            specifications: (p.specifications as Record<string, unknown>) ?? null,
            description: (p.description as string) ?? null,
            _source: 'vector_fallback',
          }))
          .sort((a, b) => (distMap[a.sku] ?? 1) - (distMap[b.sku] ?? 1));

        searchMode = 'vector_fallback';
      }
    }

    // ── Log query ─────────────────────────────────────────────────────────
    const { data: queryLog } = await supabase
      .from('queries')
      .insert({
        engineer_id: engineer_id ?? null,
        raw_query: query,
        detected_language: null,
        country_context: country ?? null,
        top_matches: matches.slice(0, 20),
      })
      .select('id')
      .single();

    return Response.json({
      mode: 'results',
      query_id: queryLog?.id ?? '',
      detected_language: '',
      matches,
      total: matches.length,
      _searchMode: searchMode,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SEARCH ERROR]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── Competitor cross-reference lookup ──────────────────────────────────────

async function competitorRefSearch(
  supabase: SupabaseClient,
  ref: string,
  family?: string
): Promise<MatchResult[]> {
  const { data: xrefs } = await supabase
    .from('competitor_crossrefs')
    .select('axis_sku')
    .ilike('competitor_sku', `%${ref}%`);

  if (!xrefs || xrefs.length === 0) return [];

  const skus = Array.from(new Set(xrefs.map(x => x.axis_sku).filter(Boolean)));
  if (skus.length === 0) return [];

  let q = supabase.from('products').select('*').in('sku', skus).eq('is_active', true);
  if (family) q = q.eq('family', family);
  const { data: products } = await q;

  return ((products ?? []) as Array<Record<string, unknown>>).map((p, i) => ({
    rank: i + 1,
    sku: p.sku as string,
    name: (p.name as string) ?? (p.sku as string),
    confidence: 'high' as const,
    reasoning: `Direct cross-reference match for ${ref}`,
    score: 100,
    family: (p.family as string) ?? null,
    specifications: (p.specifications as Record<string, unknown>) ?? null,
    description: (p.description as string) ?? null,
    _source: 'crossref',
  }));
}

// ── Progressive SQL spec search ───────────────────────────────────────────

type FilterLevel = {
  useDiameter: boolean;
  useLength: boolean;
  useMaterial: boolean;
  useThread: boolean;
  useCS: boolean;
  exactLength?: boolean;
};

const FILTER_LEVELS: FilterLevel[] = [
  { useDiameter: true,  useLength: true,  useMaterial: true,  useThread: true,  useCS: true  },
  { useDiameter: true,  useLength: true,  useMaterial: true,  useThread: false, useCS: true  },
  { useDiameter: true,  useLength: true,  useMaterial: true,  useThread: false, useCS: true,  exactLength: true },
  { useDiameter: true,  useLength: false, useMaterial: true,  useThread: false, useCS: true  },
  { useDiameter: false, useLength: false, useMaterial: true,  useThread: false, useCS: true  },
  { useDiameter: false, useLength: false, useMaterial: true,  useThread: false, useCS: false },
  { useDiameter: false, useLength: false, useMaterial: false, useThread: false, useCS: false },
];

async function sqlSpecSearch(
  supabase: SupabaseClient,
  parsed: ParsedQuery,
  family?: string,
  country?: string
): Promise<(MatchResult & { _source?: string })[]> {
  const { specs } = parsed;
  const hasAnySpec = Object.keys(specs).length > 0;

  for (let level = 0; level < FILTER_LEVELS.length; level++) {
    const filters = FILTER_LEVELS[level];
    const rows = await executeSearch(supabase, parsed, filters, family, country);

    if (rows.length > 0) {
      console.log(`[SEARCH] ${rows.length} results at level ${level}`);
      const confidence: MatchResult['confidence'] = level === 0 ? 'high' : level <= 2 ? 'medium' : 'low';
      const score = Math.max(100 - level * 12, 40);

      return rows.map((p, i) => ({
        rank: i + 1,
        sku: p.sku as string,
        name: (p.name as string) ?? (p.sku as string),
        confidence,
        reasoning: buildReasoning(specs, filters, level),
        score,
        family: (p.family as string) ?? null,
        specifications: (p.specifications as Record<string, unknown>) ?? null,
        description: (p.description as string) ?? null,
        _source: `sql_level_${level}`,
      }));
    }
  }

  // Never reached unless productType is empty
  void (hasAnySpec); // suppress unused warning
  return [];
}

async function executeSearch(
  supabase: SupabaseClient,
  parsed: ParsedQuery,
  filters: FilterLevel,
  family?: string,
  _country?: string
): Promise<Array<Record<string, unknown>>> {
  const { productType, specs } = parsed;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from('products').select('*').eq('is_active', true);

  // Product type name search — always applied if non-trivial
  if (productType && productType.length > 1) {
    q = q.ilike('name', `%${productType}%`);
  }

  if (family) q = q.eq('family', family);

  // Spec filters via jsonb column operators
  if (filters.useMaterial && specs.material) {
    q = q.ilike('specifications->>material', `%${specs.material}%`);
  }

  if (filters.useDiameter && specs.diameter_min != null && specs.diameter_max != null) {
    q = q
      .gte('specifications->>diameter_mm', specs.diameter_min)
      .lte('specifications->>diameter_mm', specs.diameter_max);
  }

  if (filters.useLength && specs.length_min != null && specs.length_max != null) {
    if (filters.exactLength && specs.length_mm != null) {
      q = q.eq('specifications->>length_mm', specs.length_mm);
    } else {
      q = q
        .gte('specifications->>length_mm', specs.length_min)
        .lte('specifications->>length_mm', specs.length_max);
    }
  }

  if (filters.useCS && specs.cross_section_min != null && specs.cross_section_max != null) {
    q = q
      .gte('specifications->>cross_section_mm2', specs.cross_section_min)
      .lte('specifications->>cross_section_mm2', specs.cross_section_max);
  }

  if (filters.useThread && specs.thread_type) {
    q = q.eq('specifications->>thread_type', specs.thread_type);
  }

  if (specs.size_inches) {
    q = q.eq('specifications->>size_inches', specs.size_inches);
  }

  const hasSpecs = Object.keys(specs).length > 0;
  q = q.limit(hasSpecs ? 100 : 300);

  const { data, error } = await q;
  if (error) {
    console.error('[SQL SEARCH ERROR]', error.message);
    return [];
  }
  return data ?? [];
}

function buildReasoning(
  specs: ParsedQuery['specs'],
  filters: FilterLevel,
  level: number
): string {
  const parts: string[] = [];
  if (filters.useMaterial && specs.material) parts.push(`material: ${specs.material}`);
  if (filters.useDiameter && specs.diameter_mm) parts.push(`diameter: ${specs.diameter_mm}mm`);
  if (filters.useLength && specs.length_mm) parts.push(`length: ${specs.length_mm}mm`);
  if (filters.useCS && specs.cross_section_mm2) parts.push(`${specs.cross_section_mm2}mm²`);
  if (filters.useThread && specs.thread_type) parts.push(specs.thread_type);

  if (parts.length === 0) return 'Matched by product type';
  if (level === 0) return `Exact match — ${parts.join(', ')}`;
  if (level <= 2) return `Close match — ${parts.join(', ')}`;
  return `Partial match — ${parts.join(', ')}`;
}
