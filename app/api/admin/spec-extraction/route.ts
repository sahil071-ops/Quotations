export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('count') === '1') {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    return Response.json({ total: count });
  }
  return Response.json({ error: 'Invalid request' }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const { offset, batchSize } = await req.json();

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: products, error } = await supabase
      .from('products')
      .select('id, sku, name, family')
      .eq('is_active', true)
      .range(offset, offset + batchSize - 1);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!products || products.length === 0) {
      return Response.json({ done: true, processed: 0, nextOffset: null });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract structured specifications from these electrical hardware product names.
For each product, extract whatever specs are present in the name.

Common specs to look for:
- material: e.g. "copper bonded", "pure copper", "galvanised steel", "stainless steel SS316", "brass", "gunmetal", "aluminium", "mild steel"
- diameter_mm: numeric diameter in mm (convert if given in inches: 1"=25.4, 5/8"=15.875, 3/4"=19.05, 1/2"=12.7)
- length_mm: numeric length in mm (convert if given in feet: 1ft=304.8)
- thread_type: "unthreaded", "externally threaded", "one side threaded", "both sides threaded"
- end_finish: "plain", "pointed", "with driving head", "with coupler", "with spike"
- coating_microns: numeric microns value if present
- cross_section_mm2: for cables/conductors
- voltage_kv: for HV products
- standard: e.g. "IEC", "BS EN", "DIN"
- plate_type: "single plate", "double plate" for clamps
- bolt_material: "brass", "SS304", "SS316" for clamps/glands

Products:
${products.map(p => `${p.sku}|${p.name}`).join('\n')}

Return a JSON object mapping SKU to extracted specs. Only include fields that are actually present.
Example: {"SKU123": {"material": "copper bonded", "diameter_mm": 14.2, "length_mm": 2440, "thread_type": "unthreaded"}}

Respond with valid JSON only, no explanation, no markdown:`,
        }],
      }),
    });

    const data = await response.json();
    let text = data.content?.[0]?.text?.trim() || '{}';

    // Strip markdown code fences if Haiku wrapped the response
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let specsMap: Record<string, Record<string, unknown>> = {};
    try {
      specsMap = JSON.parse(text);
    } catch {
      console.error('[SPEC EXTRACTION] JSON parse failed. Raw response:', text.slice(0, 500));
      return Response.json({
        done: false,
        processed: products.length,
        nextOffset: offset + batchSize,
        errors: [`JSON parse failed — raw: ${text.slice(0, 200)}`],
      });
    }

    let updated = 0;
    const updateErrors: string[] = [];

    for (const product of products) {
      const specs = specsMap[product.sku];
      if (!specs || Object.keys(specs).length === 0) continue;

      const { error: updateError } = await supabase
        .from('products')
        .update({ specifications: specs })
        .eq('id', product.id);

      if (updateError) {
        console.error(`[SPEC EXTRACTION] Update failed for ${product.sku}:`, updateError);
        updateErrors.push(`${product.sku}: ${updateError.message}`);
      } else {
        updated++;
      }
    }

    const isLastBatch = products.length < batchSize;

    return Response.json({
      done: isLastBatch,
      processed: products.length,
      updated,
      nextOffset: isLastBatch ? null : offset + batchSize,
      errors: updateErrors.length > 0 ? updateErrors : undefined,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
