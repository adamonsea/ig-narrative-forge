import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { keywordId } = await req.json();

    if (!keywordId) {
      return new Response(
        JSON.stringify({ error: 'keywordId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get keyword details
    const { data: keyword, error: keywordError } = await supabase
      .from('sentiment_keyword_tracking')
      .select('*')
      .eq('id', keywordId)
      .single();

    if (keywordError || !keyword) {
      throw new Error('Keyword not found');
    }

    // Update keyword status to published
    const reviewDueAt = new Date();
    reviewDueAt.setDate(reviewDueAt.getDate() + 7); // 7 days from now

    const { error: updateError } = await supabase
      .from('sentiment_keyword_tracking')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        review_due_at: reviewDueAt.toISOString()
      })
      .eq('id', keywordId);

    if (updateError) throw updateError;

    // Generate detail card
    const card = {
      topic_id: keyword.topic_id,
      keyword_phrase: keyword.keyword_phrase,
      card_category: 'detail',
      content: {
        headline: `"${keyword.keyword_phrase}" trending in coverage`,
        summary: `This phrase appeared ${keyword.total_mentions} times across ${keyword.source_count} sources in the last week`,
        statistics: `${keyword.total_mentions} mentions • ${keyword.source_count} sources`
      },
      sources: keyword.sources || [],
      sentiment_score: Math.round((keyword.sentiment_ratio || 0) * 100),
      confidence_score: 85,
      analysis_date: new Date().toISOString(),
      card_type: 'trend',
      is_published: true,
      is_visible: true,
      needs_review: false
    };

    const { data: insertedCard, error: insertError } = await supabase
      .from('sentiment_cards')
      .insert(card)
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Detail card generated for keyword: ${keyword.keyword_phrase}`);

    return new Response(
      JSON.stringify({ success: true, card: insertedCard }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating sentiment card:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
