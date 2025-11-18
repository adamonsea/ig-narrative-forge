import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    console.log('🔄 Auto-recovery started at:', new Date().toISOString());
    console.log('🕐 Looking for stories/queue items stuck before:', tenMinutesAgo);

    // === PART 1: Recover Stuck Stories ===
    const { data: stuckStories, error: storiesError } = await supabase
      .from('stories')
      .select('id, article_id, topic_article_id, title, status, updated_at')
      .eq('status', 'processing')
      .lt('updated_at', tenMinutesAgo);

    if (storiesError) {
      console.error('❌ Error finding stuck stories:', storiesError);
    } else if (stuckStories && stuckStories.length > 0) {
      console.log(`🚨 Found ${stuckStories.length} stuck stories:`, 
        stuckStories.map(s => ({ id: s.id, title: s.title, stuckSince: s.updated_at }))
      );

      // Reset stories to draft
      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .in('id', stuckStories.map(s => s.id));

      if (resetError) {
        console.error('❌ Error resetting stuck stories:', resetError);
      } else {
        console.log('✅ Reset stuck stories to draft');

        // Re-queue them for processing
        const reQueueData = stuckStories.map(story => ({
          article_id: story.article_id,
          topic_article_id: story.topic_article_id,
          status: 'pending',
          created_at: new Date().toISOString()
        }));

        const { error: queueError } = await supabase
          .from('content_generation_queue')
          .insert(reQueueData);

        if (queueError) {
          console.error('❌ Error re-queuing stories:', queueError);
        } else {
          console.log(`✅ Re-queued ${stuckStories.length} stories for processing`);
        }
      }
    } else {
      console.log('✨ No stuck stories found');
    }

    // === PART 2: Recover Stuck Queue Items ===
    const { data: stuckQueue, error: queueError } = await supabase
      .from('content_generation_queue')
      .select('id, article_id, topic_article_id, status, started_at')
      .eq('status', 'processing')
      .not('started_at', 'is', null)
      .lt('started_at', tenMinutesAgo);

    if (queueError) {
      console.error('❌ Error finding stuck queue items:', queueError);
    } else if (stuckQueue && stuckQueue.length > 0) {
      console.log(`🚨 Found ${stuckQueue.length} stuck queue items:`,
        stuckQueue.map(q => ({ id: q.id, stuckSince: q.started_at }))
      );

      const { error: resetQueueError } = await supabase
        .from('content_generation_queue')
        .update({ 
          status: 'pending',
          started_at: null,
          attempts: 0 // Reset attempts to give it a fresh start
        })
        .in('id', stuckQueue.map(q => q.id));

      if (resetQueueError) {
        console.error('❌ Error resetting stuck queue items:', resetQueueError);
      } else {
        console.log(`✅ Reset ${stuckQueue.length} queue items to pending`);
      }
    } else {
      console.log('✨ No stuck queue items found');
    }

    const summary = {
      timestamp: new Date().toISOString(),
      stuckStoriesRecovered: stuckStories?.length || 0,
      stuckQueueItemsRecovered: stuckQueue?.length || 0,
      totalRecovered: (stuckStories?.length || 0) + (stuckQueue?.length || 0)
    };

    console.log('📊 Auto-recovery summary:', summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Auto-recovery function error:', error);
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
