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

    // Generate detail card with proper sources from source_urls
    const sourceUrls = Array.isArray(keyword.source_urls) ? keyword.source_urls : [];
    const sources = sourceUrls.slice(0, 10).map((url: string) => ({
      url,
      title: keyword.keyword_phrase,
      date: new Date().toISOString().split('T')[0]
    }));

    const card = {
      topic_id: keyword.topic_id,
      keyword_phrase: keyword.keyword_phrase,
      card_category: 'detail',
      content: {
        headline: `"${keyword.keyword_phrase}" trending in coverage`,
        summary: `This phrase appeared ${keyword.total_mentions} times across ${keyword.source_count} sources in the last week`,
        statistics: `${keyword.total_mentions} mentions • ${keyword.source_count} sources`,
        external_sentiment: (keyword.sentiment_ratio || 0.5) >= 0.5 ? 'positive' : 'negative'
      },
      sources,
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
      .upsert(card, {
        onConflict: 'topic_id,keyword_phrase,analysis_date',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Detail card generated for keyword: ${keyword.keyword_phrase}`);

    // Generate comparison card for the topic
    const { data: allKeywords, error: keywordsError } = await supabase
      .from('sentiment_keyword_tracking')
      .select('*')
      .eq('topic_id', keyword.topic_id)
      .eq('status', 'published')
      .gte('total_mentions', 5)
      .order('total_mentions', { ascending: false });

    if (keywordsError) {
      console.error('Error fetching keywords for comparison:', keywordsError);
    }

    let comparisonCard = null;
    if (allKeywords && allKeywords.length >= 2) {
      // Split into positive and negative based on sentiment_ratio
      const positiveKeywords = allKeywords
        .filter(k => (k.sentiment_ratio || 0) >= 0.6)
        .slice(0, 5)
        .map(k => ({ 
          keyword: k.keyword_phrase, 
          mentions: k.total_mentions,
          ratio: k.sentiment_ratio || 0
        }));
      
      const negativeKeywords = allKeywords
        .filter(k => (k.sentiment_ratio || 0) <= 0.4)
        .slice(0, 5)
        .map(k => ({ 
          keyword: k.keyword_phrase, 
          mentions: k.total_mentions,
          ratio: k.sentiment_ratio || 0
        }));

      if (positiveKeywords.length > 0 || negativeKeywords.length > 0) {
        const totalMentions = allKeywords.reduce((sum, k) => sum + (k.total_mentions || 0), 0);
        const analysisDate = new Date().toISOString().split('T')[0];

        const comparison = {
          topic_id: keyword.topic_id,
          keyword_phrase: 'sentiment_comparison',
          card_category: 'comparison',
          comparison_keyword_ids: allKeywords.map(k => k.id),
          content: {
            headline: 'Positive vs Negative Coverage',
            summary: `Analysis of sentiment trends across ${allKeywords.length} keywords`,
            statistics: `${totalMentions} total mentions analyzed`,
            chart_data: {
              positive: positiveKeywords,
              negative: negativeKeywords
            }
          },
          sources: [],
          sentiment_score: 50,
          confidence_score: 85,
          analysis_date: analysisDate,
          card_type: 'comparison',
          is_published: true,
          is_visible: true,
          needs_review: false
        };

        const { data: insertedComparison, error: comparisonError } = await supabase
          .from('sentiment_cards')
          .upsert(comparison, {
            onConflict: 'topic_id,keyword_phrase,analysis_date',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (comparisonError) {
          console.error('Error creating comparison card:', comparisonError);
        } else {
          comparisonCard = insertedComparison;
          console.log('Comparison card generated');
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        detailCard: insertedCard,
        comparisonCard 
      }),
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
