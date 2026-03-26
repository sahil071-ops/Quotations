import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ProductMatch {
  sku: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export async function rankProductMatches(
  query: string,
  country: string,
  candidates: Array<{
    sku: string;
    name: string;
    description?: string | null;
    family?: string | null;
    specifications?: Record<string, unknown> | null;
  }>
): Promise<ProductMatch[]> {
  const candidateText = candidates
    .map(
      (c, i) =>
        `${i + 1}. SKU: ${c.sku} | Name: ${c.name} | Family: ${c.family ?? 'N/A'} | Description: ${c.description ?? 'N/A'} | Specs: ${
          c.specifications ? JSON.stringify(c.specifications) : 'N/A'
        }`
    )
    .join('\n');

  const systemPrompt = `You are a product matching expert for Axis India, an industrial technology company.
Given a client query and a list of candidate products from the Axis catalog, return the top 3 best matches ranked by relevance.

For each match return:
- sku: the product SKU
- confidence: high | medium | low
- reasoning: one sentence explaining why this is a match (in English, regardless of input language)

The client query may be in any language, use competitor part numbers, or use informal descriptions. Use your knowledge of industrial products to interpret the query correctly.

Country context: ${country}. Only recommend products available in this country.

Return ONLY a JSON array with no preamble or markdown. Format:
[{"sku": "...", "confidence": "...", "reasoning": "..."}]`;

  const userMessage = `Client query: ${query}\n\nCandidate products:\n${candidateText}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  const matches = JSON.parse(content.text) as ProductMatch[];
  return matches.slice(0, 3);
}

export async function detectLanguage(text: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    system: 'Detect the language of the input text. Return only the language name in English (e.g., "English", "Spanish", "Arabic"). Nothing else.',
    messages: [{ role: 'user', content: text.slice(0, 500) }],
  });

  const content = message.content[0];
  if (content.type !== 'text') return 'Unknown';
  return content.text.trim();
}
