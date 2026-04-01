import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ProductMatch {
  sku: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: 'select';
  options: string[];
}

export async function classifyQuery(query: string): Promise<'specific' | 'generic'> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      temperature: 0,
      system: `You are classifying product search queries for Axis Electricals, an electrical hardware manufacturer.
They make: earth rods, cable glands, cable lugs, termination kits, lightning protection, U-bolts, clamps, connectors.

Classify as GENERIC if the query is ONLY a product type name or category with no additional detail.
Classify as SPECIFIC if the query has ANY additional detail (size, material, standard, quantity, part number, competitor reference, 2+ descriptive words).

GENERIC examples: "earth rod", "u bolt", "cable gland", "termination kit", "lugs", "earth rod assembly", "cable lug", "copper rod"
SPECIFIC examples: "17.2mm copper earth rod 3000mm", "M25 brass cable gland IP68", "EXAR EXAT 1.5/4", "copper lug 70mm2", "earth rod 1200mm"

Respond with JSON only, no explanation: {"mode": "generic"} or {"mode": "specific"}`,
      messages: [{ role: 'user', content: `Query: "${query}"` }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return 'specific';
    const result = JSON.parse(content.text.trim()) as { mode: string };
    return result.mode === 'generic' ? 'generic' : 'specific';
  } catch {
    return 'specific'; // fail open — better to search than stall
  }
}

export async function generateClarifications(
  query: string,
  sampleNames: string[]
): Promise<ClarificationQuestion[]> {
  try {
    const sampleText = sampleNames.slice(0, 8).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0,
      system: `You are helping an engineer find the right electrical hardware product.
Generate exactly 2-3 clarifying questions that narrow down to the right product.
Questions should address the MOST DIFFERENTIATING attributes visible in the product names.
Do NOT ask about quantity, price, or delivery. Keep questions short and specific.
Respond with JSON only — no markdown fences.`,
      messages: [{
        role: 'user',
        content: `Engineer searched for: "${query}"

Product variants in catalog:
${sampleText}

Return JSON: {"questions": [{"id": "q1", "question": "...", "type": "select", "options": ["...", "Not sure"]}]}`,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return [];
    const clean = content.text.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as { questions: ClarificationQuestion[] };
    return result.questions ?? [];
  } catch {
    return [];
  }
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

  const countryNote = country
    ? `Country context: ${country}. Prefer products available in this country.`
    : '';

  const systemPrompt = `You are a product matching expert for Axis India, an industrial technology company.
Given a client query and a list of candidate products from the Axis catalog, return the top matches ranked by relevance.

For each match return:
- sku: the product SKU
- confidence: high | medium | low
- reasoning: one sentence explaining why this is a match (in English, regardless of input language)

The client query may be in any language, use competitor part numbers, or use informal descriptions. Use your knowledge of industrial products to interpret the query correctly.
${countryNote}

Return ONLY a JSON array with no preamble or markdown. Format:
[{"sku": "...", "confidence": "...", "reasoning": "..."}]`;

  const userMessage = `Client query: ${query}\n\nCandidate products:\n${candidateText}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  const matches = JSON.parse(content.text) as ProductMatch[];
  return matches.slice(0, 10);
}

export async function detectLanguage(text: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    temperature: 0,
    system: 'Detect the language of the input text. Return only the language name in English (e.g., "English", "Spanish", "Arabic"). Nothing else.',
    messages: [{ role: 'user', content: text.slice(0, 500) }],
  });

  const content = message.content[0];
  if (content.type !== 'text') return 'Unknown';
  return content.text.trim();
}
