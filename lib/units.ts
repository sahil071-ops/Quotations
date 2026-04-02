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
