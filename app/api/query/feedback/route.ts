import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query_id,
      engineer_id,
      raw_query,
      country_context,
      ai_suggested_sku,
      correct_sku,
      correction_notes,
    } = body;

    if (!raw_query || !correct_sku) {
      return NextResponse.json({ error: 'raw_query and correct_sku are required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // Verify correct_sku exists
    const { data: product } = await adminSupabase
      .from('products')
      .select('sku')
      .eq('sku', correct_sku)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Product SKU not found' }, { status: 404 });
    }

    // Save feedback
    const { data: feedback, error } = await adminSupabase
      .from('feedback')
      .insert({
        query_id: query_id ?? null,
        engineer_id: engineer_id ?? null,
        raw_query,
        country_context: country_context ?? null,
        ai_suggested_sku: ai_suggested_sku ?? null,
        correct_sku,
        correction_notes: correction_notes ?? null,
        promoted_to_index: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Feedback insert error:', error);
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
    }

    // Mark query as corrected
    if (query_id) {
      await adminSupabase
        .from('queries')
        .update({ was_corrected: true, selected_sku: correct_sku })
        .eq('id', query_id);
    }

    return NextResponse.json({ success: true, feedback_id: feedback.id });
  } catch (err) {
    console.error('Feedback error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Approve a match (no correction needed)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { query_id, selected_sku } = body;

    if (!query_id || !selected_sku) {
      return NextResponse.json({ error: 'query_id and selected_sku are required' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();
    await adminSupabase
      .from('queries')
      .update({ selected_sku, was_corrected: false })
      .eq('id', query_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Approve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
