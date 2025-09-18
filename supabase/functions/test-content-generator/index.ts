import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    console.log('🧪 Testing Phase 2 - Enhanced Content Generator Multi-tenant Support');

    // Get a pending queue item
    const { data: queueItem, error: queueError } = await supabase
      .from('content_generation_queue')
      .select('*')
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (queueError || !queueItem) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No pending queue items found',
          queueError 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Testing with queue item: ${queueItem.id}, topic_article_id: ${queueItem.topic_article_id}`);

    // Call enhanced-content-generator
    const { data: generatorResult, error: generatorError } = await supabase.functions.invoke('enhanced-content-generator', {
      body: {
        articleId: queueItem.article_id,
        topicArticleId: queueItem.topic_article_id,
        sharedContentId: queueItem.shared_content_id,
        slideType: queueItem.slidetype || 'tabloid',
        aiProvider: queueItem.ai_provider || 'deepseek',
        tone: queueItem.tone || 'conversational',
        audienceExpertise: queueItem.audience_expertise || 'intermediate'
      }
    });

    if (generatorError) {
      console.error('❌ Content generator failed:', generatorError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Content generator failed',
          details: generatorError 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Content generator succeeded:', generatorResult);

    // Check if story was created
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('id, title, status, topic_article_id, shared_content_id, audience_expertise')
      .eq('topic_article_id', queueItem.topic_article_id)
      .single();

    if (storyError) {
      console.warn('⚠️ Could not find created story:', storyError);
    }

    // Update queue item to completed
    const { error: updateError } = await supabase
      .from('content_generation_queue')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_data: generatorResult
      })
      .eq('id', queueItem.id);

    if (updateError) {
      console.warn('⚠️ Could not update queue item:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Phase 2 test completed successfully',
        queueItem: {
          id: queueItem.id,
          topic_article_id: queueItem.topic_article_id,
          shared_content_id: queueItem.shared_content_id
        },
        generatorResult,
        story: story || null,
        pipeline_status: 'working'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        phase: 'Phase 2 - Multi-tenant Content Generator Test'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});