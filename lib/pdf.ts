// pdfjs-dist is ESM-only — use dynamic import inside async function.
// It is listed in serverExternalPackages so webpack won't bundle it;
// Node.js loads it natively from node_modules at runtime.

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
  // Dynamic import — works in Node.js 18+ even from CJS context
  const pdfjsLib = await import('pdfjs-dist');

  // No web worker needed in serverless Node.js environment
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,   // avoid font-loading errors
    disableFontFace: true,  // not needed for text extraction
    verbosity: 0,           // suppress pdfjs console warnings
  });

  let pdfDoc: Awaited<typeof loadingTask.promise>;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not open PDF: ${msg}. Check the file is not password-protected or corrupted.`);
  }

  const pages: PdfPage[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      // TextContent items are either TextItem (has .str) or TextMarkedContent (no .str)
      const text = (textContent.items as Array<{ str?: string }>)
        .filter((item) => item.str)
        .map((item) => item.str!)
        .join(' ')
        .trim();
      if (text) {
        pages.push({ pageNumber: i, text });
      }
    } catch (pageErr) {
      // Skip this page and continue — don't fail the whole document
      const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`PDF page ${i} skipped (${msg})`);
    }
  }

  return {
    pages,
    totalPages: pdfDoc.numPages,
    fullText: pages.map((p) => p.text).join('\n\n'),
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
