export interface ParsedQuery {
  productType: string;
  specs: {
    material?: string;
    diameter_mm?: number;
    diameter_min?: number;
    diameter_max?: number;
    length_mm?: number;
    length_min?: number;
    length_max?: number;
    cross_section_mm2?: number;
    cross_section_min?: number;
    cross_section_max?: number;
    thread_type?: string;
    end_finish?: string;
    size_inches?: string;
    voltage_kv?: number;
    ip_rating?: string;
    standard?: string;
  };
  competitorRef?: string;
  isCompetitorQuery: boolean;
}

const FEET_TO_MM = 304.8;
const INCH_TO_MM = 25.4;
// Sorted longest-first so '1-1/4' is tried before '1/4', '1/4' before '1/8', etc.
// Whole numbers ('1', '2') intentionally omitted — too ambiguous (match "1.5/4" etc.)
const FRACTIONS: Record<string, number> = {
  '1-1/2': 1.5, '1-1/4': 1.25,
  '11/16': 0.6875, '9/16': 0.5625, '7/16': 0.4375, '5/16': 0.3125, '3/16': 0.1875,
  '7/8': 0.875, '3/4': 0.75, '5/8': 0.625, '1/2': 0.5, '3/8': 0.375, '1/4': 0.25, '1/8': 0.125,
};

export function parseQuery(rawQuery: string): ParsedQuery {
  const q = rawQuery.trim();
  const ql = q.toLowerCase();
  const specs: ParsedQuery['specs'] = {};

  // ── Competitor reference detection ────────────────────────────────────────
  const knownProductTypes = ['earth rod', 'cable gland', 'cable lug', 'lug', 'u bolt',
    'termination', 'lightning', 'clamp', 'connector', 'busbar'];
  const hasKnownProductType = knownProductTypes.some(t => ql.includes(t));

  const competitorPatterns = [
    /\b[A-Z]{2,6}\s*\d{3,}[A-Z0-9]*\b/,        // EXAT 1500, CAL150
    /\b[A-Z]+[-\/]\d+[-\/]?\d*\b/,               // nVent-style WORD-NUM
    /\b[A-Z]{2,}\s+[A-Z]{2,}\s+[\d.]+\/\d+\b/,  // EXAR EXAT 1.5/4 style
  ];
  const isCompetitorQuery = competitorPatterns.some(p => p.test(q)) && !hasKnownProductType;

  // ── Unit conversion: feet → mm ────────────────────────────────────────────
  let workingQuery = q;
  const feetMatch = ql.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft)\b/);
  if (feetMatch) {
    const mm = Math.round(parseFloat(feetMatch[1]) * FEET_TO_MM);
    workingQuery = workingQuery + ` ${mm}mm`;
    specs.length_mm = mm;
    specs.length_min = Math.round(mm * 0.92);
    specs.length_max = Math.round(mm * 1.08);
  }

  // ── Unit conversion: fractional inches → mm ───────────────────────────────
  for (const [frac, decimal] of Object.entries(FRACTIONS)) {
    const escaped = frac.replace(/[\/\-]/g, '\\$&');
    const fracPattern = new RegExp(`${escaped}\\s*(?:"|inch|inches|in)?\\b`, 'i');
    if (fracPattern.test(q)) {
      const mm = Math.round(decimal * INCH_TO_MM * 10) / 10;
      if (!specs.diameter_mm) {
        specs.diameter_mm = mm;
        specs.diameter_min = Math.round(mm * 0.88);
        specs.diameter_max = Math.round(mm * 1.12);
        workingQuery = workingQuery + ` ${mm}mm`;
      }
      break;
    }
  }

  const wl = workingQuery.toLowerCase();

  // ── Diameter extraction — explicit "dia" patterns first ───────────────────
  if (!specs.diameter_mm) {
    const diaPatterns = [
      /(\d+(?:\.\d+)?)\s*mm\s*dia/i,
      /dia(?:meter)?\s*(\d+(?:\.\d+)?)\s*mm/i,
      /(\d+(?:\.\d+)?)\s*mm\s*(?:ø|dia\b)/i,
    ];
    for (const pattern of diaPatterns) {
      const m = wl.match(pattern);
      if (m) {
        const d = parseFloat(m[1]);
        specs.diameter_mm = d;
        specs.diameter_min = Math.round(d * 0.93);
        specs.diameter_max = Math.round(d * 1.07);
        break;
      }
    }
  }

  // ── Length extraction — explicit suffix patterns first ────────────────────
  if (!specs.length_mm) {
    const lenPatterns = [
      /(\d{3,4})\s*mm\s*long/i,
      /x\s*(\d{3,4})\s*mm/i,
      /(\d{3,4})\s*mm\s*length/i,
      /length\s*(\d{3,4})\s*mm/i,
    ];
    for (const pattern of lenPatterns) {
      const m = wl.match(pattern);
      if (m) {
        const l = parseFloat(m[1]);
        specs.length_mm = l;
        specs.length_min = Math.round(l * 0.95);
        specs.length_max = Math.round(l * 1.05);
        break;
      }
    }
  }

  // ── Bare mm values: small (<100) = diameter, large (≥100) = length ────────
  // Only applied when not already set by explicit patterns or unit conversion above.
  // Scans wl (which includes appended conversions) so converted values count too.
  if (!specs.diameter_mm || !specs.length_mm) {
    const bareMmMatches = Array.from(wl.matchAll(/\b(\d+(?:\.\d+)?)\s*mm\b/gi));
    for (const m of bareMmMatches) {
      const val = parseFloat(m[1]);
      if (val < 100 && !specs.diameter_mm) {
        specs.diameter_mm = val;
        specs.diameter_min = Math.round(val * 0.93);
        specs.diameter_max = Math.round(val * 1.07);
      } else if (val >= 100 && !specs.length_mm) {
        specs.length_mm = val;
        specs.length_min = Math.round(val * 0.95);
        specs.length_max = Math.round(val * 1.05);
      }
    }
  }

  // ── Cross section extraction ──────────────────────────────────────────────
  const csPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:mm2|mm²|sqmm)/i,
    /(\d+(?:\.\d+)?)\s*sq\.?\s*mm/i,
  ];
  for (const pattern of csPatterns) {
    const m = wl.match(pattern);
    if (m) {
      const cs = parseFloat(m[1]);
      specs.cross_section_mm2 = cs;
      specs.cross_section_min = cs * 0.95;
      specs.cross_section_max = cs * 1.05;
      break;
    }
  }

  // ── Material extraction ───────────────────────────────────────────────────
  if (wl.includes('copper bond') || wl.includes('copper-bond') || wl.includes('cbr')) {
    specs.material = 'copper bonded';
  } else if (wl.includes('pure copper') || wl.includes('solid copper')) {
    specs.material = 'pure copper';
  } else if (wl.includes('galvanised') || wl.includes('galvanized') || wl.includes('hdg') || wl.includes('gi ')) {
    specs.material = 'galvanised';
  } else if (wl.includes('stainless') || wl.includes('ss316') || wl.includes('ss304') || wl.includes('ss 316')) {
    specs.material = 'stainless steel';
  } else if (wl.includes('brass')) {
    specs.material = 'brass';
  } else if (wl.includes('aluminium') || wl.includes('aluminum')) {
    specs.material = 'aluminium';
  } else if (wl.includes('mild steel') || wl.includes(' ms ')) {
    specs.material = 'mild steel';
  }

  // ── Thread type extraction ────────────────────────────────────────────────
  if (wl.includes('both side') && wl.includes('thread')) specs.thread_type = 'both sides threaded';
  else if (wl.includes('one side') && wl.includes('thread')) specs.thread_type = 'one side threaded';
  else if (wl.includes('externally thread')) specs.thread_type = 'externally threaded';
  else if (wl.includes('unthread')) specs.thread_type = 'unthreaded';

  // ── End finish extraction ─────────────────────────────────────────────────
  if (wl.includes('driving head')) specs.end_finish = 'with driving head';
  else if (wl.includes('pointed')) specs.end_finish = 'pointed';
  else if (wl.includes('coupler')) specs.end_finish = 'with coupler';

  // ── Size in inches (cable glands) ────────────────────────────────────────
  const inchSizeMatch = q.match(/^(1-1\/2|1\/2|3\/4|1|2|2-1\/2|3|4)['"]/);
  if (inchSizeMatch) specs.size_inches = inchSizeMatch[1];

  // ── IP rating ─────────────────────────────────────────────────────────────
  const ipMatch = wl.match(/ip\s*(\d{2})/i);
  if (ipMatch) specs.ip_rating = `IP${ipMatch[1]}`;

  // ── Voltage ──────────────────────────────────────────────────────────────
  const kvMatch = wl.match(/(\d+(?:\.\d+)?)\s*kv/i);
  if (kvMatch) specs.voltage_kv = parseFloat(kvMatch[1]);

  // ── Product type: strip spec tokens from the ORIGINAL query (ql, not wl)
  //    Fractions stripped first so "5/8"" → removed before digit-cleanup runs
  let productType = ql
    .replace(/[0-9]+[-\/][0-9]+["']?/gi, '')        // fractions FIRST: 5/8", 1-1/4", 1.5/4
    .replace(/\b\d+\s*\/\s*/g, '')                   // leftover "5/" or "8/" remnants
    .replace(/\d+(?:\.\d+)?\s*(?:mm2|mm²|sqmm|sq\.?\s*mm)/gi, '')
    .replace(/\d+(?:\.\d+)?\s*mm\b/gi, '')           // bare mm values: 17.2mm, 3000mm
    .replace(/\d+(?:\.\d+)?\s*(?:feet|foot|ft)\b/gi, '')
    .replace(/\d+(?:\.\d+)?\s*(?:inch|inches|in\b|")/gi, '')
    .replace(/\bip\s*\d{2}\b/gi, '')
    .replace(/\d+(?:\.\d+)?\s*kv\b/gi, '')
    .replace(/(?:copper bonded|copper-bonded|pure copper|solid copper|galvanised|galvanized|hdg|stainless steel|stainless|ss316|ss304|ss 316|brass|aluminium|aluminum|mild steel)\b/gi, '')
    .replace(/(?:both sides threaded|one side threaded|externally threaded|unthreaded)\b/gi, '')
    .replace(/(?:with driving head|pointed|with coupler)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    productType,
    specs,
    isCompetitorQuery,
    competitorRef: isCompetitorQuery ? q : undefined,
  };
}
