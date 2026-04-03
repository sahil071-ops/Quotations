// Unit conversion utilities for query enrichment.
// Appends metric equivalents to queries that contain imperial measurements
// so the embedding model can match metric product names.

const FEET_TO_MM = 304.8;
const INCH_TO_MM = 25.4;

// Common fractional inches and their decimal equivalents
const FRACTIONS: Record<string, number> = {
  '1/8': 0.125,
  '3/16': 0.1875,
  '1/4': 0.25,
  '3/8': 0.375,
  '1/2': 0.5,
  '5/8': 0.625,
  '3/4': 0.75,
  '7/8': 0.875,
};

export function enrichQueryWithMetric(query: string): string {
  const conversions: string[] = [];

  // Convert feet: "8 feet", "8ft", "8 ft", "8'" (but not 8")
  const feetRegex = /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft\b|'(?!"))/gi;
  let m: RegExpExecArray | null;
  while ((m = feetRegex.exec(query)) !== null) {
    const mm = Math.round(parseFloat(m[1]) * FEET_TO_MM);
    conversions.push(`${mm}mm`);
  }

  // Convert fractional inches: "5/8\"", "5/8 inch", "5/8 in"
  for (const [fraction, decimal] of Object.entries(FRACTIONS)) {
    const escaped = fraction.replace('/', '\\/');
    const fracRegex = new RegExp(`${escaped}\\s*(?:inch(?:es)?|in\\b|")?`, 'gi');
    if (fracRegex.test(query)) {
      const rawMm = decimal * INCH_TO_MM;
      // Include both the precise value and the rounded value that may appear in product names
      conversions.push(`${Math.round(rawMm * 10) / 10}mm`);
      if (Math.round(rawMm) !== Math.round(rawMm * 10) / 10) {
        conversions.push(`${Math.round(rawMm)}mm`);
      }
    }
  }

  // Convert whole/decimal inches: "2 inch", "2\"", "2.5 inches"
  // Exclude numbers already matched as feet and skip large values (avoid false positives)
  const inchRegex = /(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|"(?!'))/gi;
  while ((m = inchRegex.exec(query)) !== null) {
    const val = parseFloat(m[1]);
    if (val < 100) {
      conversions.push(`${Math.round(val * INCH_TO_MM)}mm`);
    }
  }

  if (conversions.length === 0) return query;
  return `${query} ${conversions.join(' ')}`;
}

export interface QuerySpecs {
  diameter_mm?: number;
  diameter_min?: number;
  diameter_max?: number;
  length_mm?: number;
  length_min?: number;
  length_max?: number;
  material?: string;
}

export function extractSpecsFromQuery(query: string): QuerySpecs {
  const specs: QuerySpecs = {};
  const q = query.toLowerCase();

  // Extract diameter — direct mm mention
  const diaMatch =
    q.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:dia|diameter)/i) ||
    q.match(/dia(?:meter)?\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (diaMatch) {
    const d = parseFloat(diaMatch[1]);
    specs.diameter_mm = d;
    specs.diameter_min = d * 0.95;
    specs.diameter_max = d * 1.05;
  }

  // Extract diameter from fractional inches
  const fractions: Record<string, number> = {
    '5/8': 15.875, '3/4': 19.05, '1/2': 12.7, '1/4': 6.35,
    '7/8': 22.225, '1': 25.4, '3/8': 9.525,
  };
  for (const [frac, mm] of Object.entries(fractions)) {
    if (q.includes(frac + '"') || q.includes(frac + ' inch') || q.includes(frac + '\u201d')) {
      if (!specs.diameter_mm) {
        specs.diameter_mm = mm;
        specs.diameter_min = mm * 0.9;
        specs.diameter_max = mm * 1.1;
      }
    }
  }

  // Extract length — direct mm mention
  const lenMmMatch =
    q.match(/(\d+)\s*mm\s*(?:long|length)/i) ||
    q.match(/(?:long|length)\s*(\d+)\s*mm/i) ||
    q.match(/x\s*(\d{3,4})\s*mm/i);
  if (lenMmMatch) {
    const l = parseFloat(lenMmMatch[1]);
    specs.length_mm = l;
    specs.length_min = l * 0.95;
    specs.length_max = l * 1.05;
  }

  // Extract length from feet
  const feetMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|'(?!"))/i);
  if (feetMatch && !specs.length_mm) {
    const l = parseFloat(feetMatch[1]) * 304.8;
    specs.length_mm = l;
    specs.length_min = l * 0.92;
    specs.length_max = l * 1.08;
  }

  // Extract material hints
  if (q.includes('copper bond') || q.includes('copper-bond')) specs.material = 'copper bonded';
  else if (q.includes('pure copper') || q.includes('solid copper')) specs.material = 'pure copper';
  else if (q.includes('stainless') || q.includes('ss316') || q.includes('ss304')) specs.material = 'stainless';
  else if (q.includes('galvanised') || q.includes('galvanized') || q.includes('hdg')) specs.material = 'galvanised';
  else if (q.includes('brass')) specs.material = 'brass';
  else if (q.includes('copper')) specs.material = 'copper';

  return specs;
}
