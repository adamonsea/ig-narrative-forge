import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get the action from request body, default to legacy behavior
    let action = 'reset_stuck_processing';
    let jobId = null;
    let storyId = null;
    
    try {
      const body = await req.json();
      action = body.action || 'reset_stuck_processing';
      jobId = body.jobId;
      storyId = body.storyId;
    } catch (e) {
      // No body or invalid JSON, use defaults
    }
    
    console.log(`🔄 Reset action: ${action}`, { jobId, storyId });

    let result: { success: boolean; message: string; data: any } = { success: false, message: '', data: null };

    switch (action) {
      case 'reset_stuck_processing':
        // Reset stories stuck in processing for more than 5 minutes
        const { data: stuckStories, error: selectError } = await supabase
          .from('stories')
          .select('id, title, article_id')
          .eq('status', 'processing')
          .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

        if (selectError) throw selectError;

        if (!stuckStories || stuckStories.length === 0) {
          result = {
            success: true,
            message: 'No stuck stories found',
            data: { reset_count: 0 }
          };
          break;
        }

        // Reset the stuck stories
        const { error: updateError } = await supabase
          .from('stories')
          .update({ 
            status: 'draft', 
            updated_at: new Date().toISOString() 
          })
          .in('id', stuckStories.map(s => s.id));

        if (updateError) throw updateError;

        // Create queue jobs for the reset stories
        const queueJobs = stuckStories.map(story => ({
          article_id: story.article_id,
          status: 'pending',
          slidetype: 'tabloid'
        }));

        const { error: queueError } = await supabase
          .from('content_generation_queue')
          .insert(queueJobs);

        if (queueError) {
          console.error('Failed to create queue jobs:', queueError.message);
        }

        result = {
          success: true,
          message: `Reset ${stuckStories.length} stuck stories`,
          data: { 
            reset_count: stuckStories.length,
            stories: stuckStories.map(s => s.title)
          }
        };
        break;

      case 'clear_stuck_queue':
        // Remove queue items that have been processing for too long or have too many attempts
        const { data: clearedJobs, error: clearError } = await supabase
          .from('content_generation_queue')
          .delete()
          .or(`attempts.gte.3,and(status.eq.processing,created_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()})`)
          .select('id, article_id, attempts, status');

        if (clearError) throw clearError;

        result = {
          success: true,
          message: `Cleared ${clearedJobs?.length || 0} stuck queue items`,
          data: clearedJobs
        };
        break;

      case 'reset_story_to_pipeline':
        if (!storyId) throw new Error('Story ID required');

        // Remove any pending queue jobs for this story
        const { error: removeQueueError } = await supabase
          .from('content_generation_queue')
          .delete()
          .eq('article_id', storyId);

        // Reset story back to draft
        const { error: resetStoryError } = await supabase
          .from('stories')
          .update({ 
            status: 'draft',
            updated_at: new Date().toISOString()
          })
          .eq('id', storyId);

        if (resetStoryError) throw resetStoryError;

        result = {
          success: true,
          message: 'Story reset to pipeline successfully',
          data: { storyId, queueCleared: !removeQueueError }
        };
        break;

      case 'get_stuck_items':
        // Get information about stuck items
        const { data: stuckStoriesInfo, error: stuckStoriesError } = await supabase
          .from('stories')
          .select('id, title, status, updated_at')
          .eq('status', 'processing')
          .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

        const { data: stuckQueue, error: stuckQueueError } = await supabase
          .from('content_generation_queue')
          .select('id, article_id, status, attempts, created_at, error_message')
          .or(`attempts.gte.3,and(status.eq.processing,created_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()})`);

        if (stuckStoriesError || stuckQueueError) {
          throw stuckStoriesError || stuckQueueError;
        }

        result = {
          success: true,
          message: 'Retrieved stuck items information',
          data: {
            stuckStories: stuckStoriesInfo || [],
            stuckQueue: stuckQueue || []
          }
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`✅ Reset action completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Reset function error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});