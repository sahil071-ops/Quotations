// unpdf handles pdfjs-dist worker setup automatically for serverless environments.
// We use getDocumentProxy (worker-safe) then iterate pages natively for
// per-page error recovery — bad pages are skipped, not whole-document crashes.
import { getDocumentProxy } from 'unpdf';

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
  const uint8Array = new Uint8Array(buffer);

  let proxy: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    proxy = await getDocumentProxy(uint8Array, {
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not open PDF: ${msg}`);
  }

  const totalPages = proxy.numPages;
  const pages: PdfPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await proxy.getPage(i);
      const textContent = await page.getTextContent();
      const text = (textContent.items as Array<{ str?: string }>)
        .filter((item) => item.str)
        .map((item) => item.str!)
        .join(' ')
        .trim();
      if (text) {
        pages.push({ pageNumber: i, text });
      }
    } catch (pageErr) {
      const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`PDF page ${i} skipped: ${msg}`);
    }
  }

  return {
    pages,
    totalPages,
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
  const wordsPerChunk = Math.floor(maxTokens * 0.75);
  const overlapWords = Math.floor(overlapTokens * 0.75);
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.join(' '), pageNumber });
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

  const skuPattern = /\b[A-Z]{2,5}[-_]?[\dA-Z]{2,10}(?:[-_][\dA-Z]{1,10})*\b/g;
  const regexMatches = text.match(skuPattern) ?? [];

  for (const match of regexMatches) {
    if (knownSkus.includes(match) && !found.includes(match)) {
      found.push(match);
    }
  }

  return Array.from(new Set(found));
}
