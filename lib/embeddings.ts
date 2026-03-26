import OpenAI from 'openai';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export function contentHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

export function buildProductEmbeddingText(product: {
  sku: string;
  name: string;
  description?: string | null;
  family?: string | null;
  specifications?: Record<string, unknown> | null;
  countries?: string[] | null;
  extraAliases?: string[];
}): string {
  const specs = product.specifications
    ? Object.entries(product.specifications)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : '';

  const parts = [
    `SKU: ${product.sku}`,
    `Name: ${product.name}`,
    product.description ? `Description: ${product.description}` : '',
    product.family ? `Family: ${product.family}` : '',
    specs ? `Specifications: ${specs}` : '',
    product.countries?.length ? `Available in: ${product.countries.join(', ')}` : '',
    ...(product.extraAliases?.map((a) => `Alias: ${a}`) ?? []),
  ];

  return parts.filter(Boolean).join('\n');
}

export function buildCatalogChunkText(
  chunkText: string,
  family: string,
  countries: string[]
): string {
  return `[Family: ${family}] [Countries: ${countries.join(', ')}]\n${chunkText}`;
}
