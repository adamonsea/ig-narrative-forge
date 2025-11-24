import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

    console.log('🔄 Sentiment Card Scheduler Started', {
      timestamp: new Date().toISOString(),
      trigger: 'automated'
    });

    // Find keywords due for card generation (only from enabled topics)
    const now = new Date();
    
    // First, check what's in the tracking table
    const { data: allTracked, error: debugError } = await supabase
      .from('sentiment_keyword_tracking')
      .select('*')
      .eq('tracked_for_cards', true)
      .limit(10);
    
    console.log('🔍 Debug: All tracked keywords', {
      count: allTracked?.length || 0,
      keywords: allTracked?.map(k => ({
        phrase: k.keyword_phrase,
        topic: k.topic_id,
        trend: k.current_trend,
        nextDue: k.next_card_due_at,
        lastSeen: k.last_seen_at
      }))
    });
    
    // Step 1: Get all enabled topics
    const { data: enabledTopics, error: topicError } = await supabase
      .from('topic_sentiment_settings')
      .select('topic_id')
      .eq('enabled', true);

    if (topicError) {
      console.error('❌ Error fetching enabled topics:', topicError);
      throw topicError;
    }

    const enabledTopicIds = enabledTopics?.map(t => t.topic_id) || [];
    console.log(`✅ Found ${enabledTopicIds.length} enabled topic(s):`, enabledTopicIds);

    if (enabledTopicIds.length === 0) {
      console.warn('⚠️ No topics with sentiment enabled');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No topics with sentiment enabled', 
          processed: 0,
          debug: {
            trackedKeywordsTotal: allTracked?.length || 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Step 2: Get due keywords for those enabled topics
    const { data: dueKeywords, error: queryError } = await supabase
      .from('sentiment_keyword_tracking')
      .select('id, topic_id, keyword_phrase, total_cards_generated, next_card_due_at, current_trend, last_seen_at')
      .eq('tracked_for_cards', true)
      .in('topic_id', enabledTopicIds)
      .in('current_trend', ['emerging', 'sustained'])
      .or(`next_card_due_at.is.null,next_card_due_at.lte.${now.toISOString()}`)
      .limit(20);

    if (queryError) {
      console.error('❌ Error querying keywords:', queryError);
      throw queryError;
    }

    console.log(`📊 Query Results`, {
      keywordsFound: dueKeywords?.length || 0,
      now: now.toISOString(),
      keywords: dueKeywords?.map(k => ({
        phrase: k.keyword_phrase,
        topic: k.topic_id,
        trend: k.current_trend,
        dueAt: k.next_card_due_at,
        overdue: k.next_card_due_at ? new Date(k.next_card_due_at) < now : true
      }))
    });

    if (!dueKeywords || dueKeywords.length === 0) {
      console.warn('⚠️ No keywords due for card generation', {
        timestamp: now.toISOString(),
        possibleReasons: [
          'No keywords with tracked_for_cards=true',
          'No enabled topic_sentiment_settings',
          'No keywords with trend "emerging" or "sustained"',
          'All keywords have future next_card_due_at dates'
        ]
      });
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No keywords due for generation',
          processed: 0,
          debug: {
            trackedKeywordsTotal: allTracked?.length || 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let errors = 0;
    const topicsToProcess = [...new Set(dueKeywords.map(k => k.topic_id))];

    console.log(`🎯 Processing ${topicsToProcess.length} unique topics`);

    for (const topicId of topicsToProcess) {
      console.log(`📍 Topic ${topicId} - Invoking sentiment-detector...`);
      
      try {
        // Trigger sentiment analysis for this topic
        const { data: detectorResult, error: invokeError } = await supabase.functions.invoke('sentiment-detector', {
          body: {
            topic_id: topicId,
            mode: 'targeted',
            force_analysis: true
          }
        });

        if (invokeError) {
          console.error(`❌ Error invoking sentiment-detector for topic ${topicId}:`, {
            error: invokeError.message,
            context: invokeError.context
          });
          errors++;
          continue;
        }

        console.log(`✅ Sentiment detector completed for topic ${topicId}`, {
          result: detectorResult
        });

        // Update next generation time for processed keywords
        const keywordsForTopic = dueKeywords.filter(k => k.topic_id === topicId);
        const nextDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

        console.log(`📝 Updating ${keywordsForTopic.length} keyword tracking records`);

        for (const kw of keywordsForTopic) {
          const { error: updateError } = await supabase
            .from('sentiment_keyword_tracking')
            .update({
              last_card_generated_at: now.toISOString(),
              next_card_due_at: nextDueAt.toISOString(),
              total_cards_generated: (kw.total_cards_generated || 0) + 1,
              updated_at: now.toISOString()
            })
            .eq('id', kw.id);

          if (updateError) {
            console.error(`❌ Error updating keyword ${kw.keyword_phrase}:`, updateError);
          }
        }

        processed += keywordsForTopic.length;
      } catch (topicError) {
        console.error(`💥 Exception processing topic ${topicId}:`, {
          error: topicError instanceof Error ? topicError.message : String(topicError)
        });
        errors++;
      }
    }

    console.log('🎉 Scheduler Complete', {
      processed,
      errors,
      topics: topicsToProcess.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        topics: topicsToProcess.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('💥 Critical Error in sentiment card scheduler:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
