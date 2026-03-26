// Use require() so Next.js treats this as a server external (per next.config.mjs
// serverComponentsExternalPackages). When externalized, Node.js loads pdf-parse
// from node_modules at runtime — test files exist there and won't crash.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ numpages: number; text: string }>;

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPage[];
  totalPages: number;
  fullText: string;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  // pdf-parse uses pdfjs-dist internally. Some PDFs cause pdfjs to throw
  // "The string did not match the expected pattern" from internal color-space
  // or font parsing. Catch and rethrow with a clearer message.
  let result: { numpages: number; text: string };
  try {
    result = await pdfParse(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF parsing failed: ${msg}. The PDF may be encrypted, corrupted, or use unsupported features.`);
  }

  // pdf-parse separates pages with \f (form feed) in result.text
  const rawPages = result.text.split('\f');
  const pages: PdfPage[] = rawPages
    .map((text, i) => ({ pageNumber: i + 1, text: text.trim() }))
    .filter((p) => p.text.length > 0);

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, text: result.text.trim() });
  }

  return {
    pages,
    totalPages: result.numpages,
    fullText: result.text,
  };
}

export interface TextChunk {
  text: string;
  pageNumber?: number;
}

export function chunkText(
  text: string,
  maxTokens = 500,
  overlapTokens = 50,
  pageNumber?: number
): TextChunk[] {
  // Approximate tokens by words (1 token ≈ 0.75 words)
  const wordsPerChunk = Math.floor(maxTokens * 0.75);
  const overlapWords = Math.floor(overlapTokens * 0.75);

  // Split on double newlines first (paragraphs)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.join(' '), pageNumber });
      // Keep overlap
      const overlapStart = Math.max(0, currentChunk.length - overlapWords);
      currentChunk = currentChunk.slice(overlapStart);
      currentWordCount = currentChunk.join(' ').split(/\s+/).length;
    }
    currentChunk.push(paragraph);
    currentWordCount += words.length;
  }

  if (currentChunk.length > 0) {
    chunks.push({ text: currentChunk.join('\n\n'), pageNumber });
  }

  return chunks;
}

export function extractSkusFromText(text: string, knownSkus: string[]): string[] {
  const found: string[] = [];
  const upperText = text.toUpperCase();

  for (const sku of knownSkus) {
    if (upperText.includes(sku.toUpperCase())) {
      found.push(sku);
    }
  }

  // Also try regex pattern for common SKU formats
  const skuPattern = /\b[A-Z]{2,5}[-_]?[\dA-Z]{2,10}(?:[-_][\dA-Z]{1,10})*\b/g;
  const regexMatches = text.match(skuPattern) ?? [];

  for (const match of regexMatches) {
    if (knownSkus.includes(match) && !found.includes(match)) {
      found.push(match);
    }
  }

  return Array.from(new Set(found));
}
