import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔄 Starting sentiment tracking backfill...');

    // Find all keywords with emerging/sustained trends and 5+ mentions
    const { data: keywords, error: fetchError } = await supabase
      .from('sentiment_keyword_tracking')
      .select('*')
      .in('trend_status', ['emerging', 'sustained'])
      .gte('total_mentions', 5)
      .eq('tracked_for_cards', false);

    if (fetchError) {
      throw new Error(`Failed to fetch keywords: ${fetchError.message}`);
    }

    if (!keywords || keywords.length === 0) {
      console.log('✅ No keywords found matching criteria');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No keywords found matching criteria (emerging/sustained with 5+ mentions)',
          keywords_updated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${keywords.length} keywords to enable tracking for`);

    // Update all qualifying keywords to enable tracking
    const { error: updateError } = await supabase
      .from('sentiment_keyword_tracking')
      .update({
        tracked_for_cards: true,
        updated_at: new Date().toISOString()
      })
      .in('id', keywords.map(k => k.id));

    if (updateError) {
      throw new Error(`Failed to update keywords: ${updateError.message}`);
    }

    console.log(`✅ Enabled tracking for ${keywords.length} keywords`);

    // Group keywords by topic for summary
    const byTopic = keywords.reduce((acc, k) => {
      const topicId = k.topic_id;
      if (!acc[topicId]) {
        acc[topicId] = [];
      }
      acc[topicId].push(k.keyword_phrase);
      return acc;
    }, {} as Record<string, string[]>);

    // Trigger immediate card generation for each topic
    console.log('🎯 Triggering immediate card generation for affected topics...');
    const uniqueTopics = [...new Set(keywords.map(k => k.topic_id))];
    
    for (const topicId of uniqueTopics) {
      try {
        await supabase.functions.invoke('sentiment-detector', {
          body: {
            topic_id: topicId,
            force_analysis: false
          }
        });
        console.log(`✅ Triggered card generation for topic ${topicId}`);
      } catch (err) {
        console.error(`⚠️ Failed to trigger cards for topic ${topicId}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        keywords_updated: keywords.length,
        topics_affected: uniqueTopics.length,
        breakdown_by_topic: Object.entries(byTopic).map(([topicId, phrases]) => ({
          topic_id: topicId,
          keywords_enabled: phrases.length,
          keywords: phrases
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Backfill error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
