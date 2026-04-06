import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ProductMatch {
  sku: string;
  score: number;
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
    return 'specific';
  }
}

export async function generateClarifications(
  query: string,
  sampleNames: string[]
): Promise<ClarificationQuestion[]> {
  try {
    const sampleText = sampleNames.slice(0, 40).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are helping an engineer at Axis Electricals find the exact right product SKU.

The engineer searched for: "${query}"

These product variants exist in the catalog for this product type:
${sampleText}

Step 1: Identify which attributes are ALREADY specified in the engineer's query (e.g. material, diameter, length, thread type, end finish, plate type, standard, bolt material).

Step 2: Identify which attributes are still AMBIGUOUS — meaning the catalog has multiple different options for that attribute and the query does not specify it.

Step 3: Generate clarifying questions ONLY for ambiguous attributes. Maximum 3 questions. If fewer than 3 attributes are ambiguous, generate fewer questions. If all key attributes are already specified, return an empty questions array.

Rules:
- Extract ALL distinct values for each attribute from the product names above — do not limit options
- Always add "Other (please specify)" as the second-to-last option
- Always add "Not sure" as the very last option
- Keep question labels short (under 6 words)
- Never ask about price, quantity, or delivery

Respond with JSON only, no explanation:
{"specifiedAttributes": ["material: copper"], "questions": [{"id": "q1", "question": "Length?", "type": "select", "options": ["1200mm", "1500mm", "3000mm", "Other (please specify)", "Not sure"]}]}`,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return [];
    const clean = content.text.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as { questions: ClarificationQuestion[]; specifiedAttributes?: string[] };
    return result.questions ?? [];
  } catch {
    return [];
  }
}

export async function generateVariantQuestions(
  variantNames: string[]
): Promise<ClarificationQuestion[]> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `These are product variants from the same family. Identify what attributes ACTUALLY DIFFER between them and generate clarifying questions so an engineer can pick the right one.

Products:
${variantNames.join('\n')}

Rules:
- Only ask about attributes that differ between the products listed above
- Extract the exact option values that exist in the names (do not invent options)
- Maximum 3 questions
- Always add "Not sure" as the last option
- Keep question labels under 6 words

Respond with JSON only:
{"questions": [{"id": "q1", "question": "Thread type?", "type": "select", "options": ["Unthreaded", "Externally threaded", "Not sure"]}]}`,
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
  }>,
  originalQuery?: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<ProductMatch[]> {
  const candidateList = candidates.map((c) => ({
    sku: c.sku,
    name: c.name,
    family: c.family ?? null,
    specifications: c.specifications ?? null,
  }));

  const countryNote = country
    ? `Country context: ${country}. Prefer products available in this country.`
    : '';

  const unitNote =
    originalQuery && originalQuery !== query
      ? `Note: The query has been enriched with metric unit conversions. Original query: "${originalQuery}". Enriched query: "${query}". When scoring, treat the metric values appended (e.g. 2438mm, 16mm) as specifications to match against product names.`
      : '';

  const systemPrompt = `You are a product matching expert for Axis India, an industrial technology company.
Rate each candidate product for relevance to the engineer's query.
Return ONLY products with a relevance score of 60 or above — return ALL of them, even if that is 30+ products.
Do NOT apply an arbitrary limit.

Scoring guide:
- 85–100 (high): exact or very close match — dimensions, material, standard all align
- 70–84 (medium): good match with one minor difference or missing spec
- 60–69 (low): plausible match but missing key information
- Below 60: omit entirely
${countryNote}
${unitNote}

The query may be in any language, use competitor part numbers, or informal descriptions.

Return ONLY this JSON, no preamble:
{"matches": [{"sku": "...", "score": 95, "confidence": "high", "reasoning": "one sentence in English"}]}`;

  const userMessage = `Engineer query: ${query}\n\nCandidates:\n${JSON.stringify(candidateList)}`;

  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  const result = JSON.parse(content.text) as { matches: ProductMatch[] };
  return (result.matches ?? [])
    .filter((m) => m.score >= 60)
    .sort((a, b) => b.score - a.score);
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
