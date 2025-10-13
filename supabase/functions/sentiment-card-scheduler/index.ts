import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 Starting sentiment card scheduler...');

    // Find keywords due for card generation (only from enabled topics)
    const now = new Date();
    const { data: dueKeywords, error: queryError } = await supabase
      .from('sentiment_keyword_tracking')
      .select(`
        id, 
        topic_id, 
        keyword_phrase, 
        total_cards_generated,
        topic_sentiment_settings!inner(enabled)
      `)
      .eq('tracked_for_cards', true)
      .eq('topic_sentiment_settings.enabled', true)
      .in('current_trend', ['emerging', 'sustained'])
      .or(`next_card_due_at.is.null,next_card_due_at.lte.${now.toISOString()}`)
      .limit(20);

    if (queryError) {
      console.error('Error querying keywords:', queryError);
      throw queryError;
    }

    console.log(`📊 Found ${dueKeywords?.length || 0} keywords due for generation`);

    if (!dueKeywords || dueKeywords.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No keywords due for generation',
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    const topicsToProcess = [...new Set(dueKeywords.map(k => k.topic_id))];

    for (const topicId of topicsToProcess) {
      console.log(`🎯 Processing topic: ${topicId}`);
      
      // Trigger sentiment analysis for this topic
      const { error: invokeError } = await supabase.functions.invoke('sentiment-detector', {
        body: {
          topic_id: topicId,
          mode: 'targeted',
          force_analysis: true
        }
      });

      if (invokeError) {
        console.error(`Error invoking sentiment-detector for topic ${topicId}:`, invokeError);
        continue;
      }

      // Update next generation time for processed keywords
      const keywordsForTopic = dueKeywords.filter(k => k.topic_id === topicId);
      const nextDueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      for (const kw of keywordsForTopic) {
        await supabase
          .from('sentiment_keyword_tracking')
          .update({
            last_card_generated_at: now.toISOString(),
            next_card_due_at: nextDueAt.toISOString(),
            total_cards_generated: (kw.total_cards_generated || 0) + 1,
            updated_at: now.toISOString()
          })
          .eq('id', kw.id);
      }

      processed += keywordsForTopic.length;
    }

    console.log(`✅ Processed ${processed} keywords across ${topicsToProcess.length} topics`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        topics: topicsToProcess.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sentiment card scheduler:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
