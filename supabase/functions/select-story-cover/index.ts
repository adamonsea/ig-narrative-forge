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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { storyId, coverOptionId } = await req.json();

    if (!storyId || !coverOptionId) {
      throw new Error('Story ID and cover option ID are required');
    }

    // Authenticate user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Verify user owns this story
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        id,
        article_id,
        topic_article_id,
        articles(topic_id, topics(created_by)),
        topic_articles(topic_id, topics(created_by))
      `)
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error('Story not found');
    }

    // Check ownership
    const topicCreatedBy = story.article_id 
      ? story.articles?.topics?.created_by
      : story.topic_articles?.topics?.created_by;

    if (topicCreatedBy !== user.id) {
      throw new Error('Access denied');
    }

    // Verify cover option exists and belongs to this story
    const { data: coverOption, error: coverError } = await supabase
      .from('story_cover_options')
      .select('*')
      .eq('id', coverOptionId)
      .eq('story_id', storyId)
      .single();

    if (coverError || !coverOption) {
      throw new Error('Cover option not found');
    }

    // Update story to use this cover option
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        selected_cover_id: coverOptionId,
        cover_illustration_url: coverOption.cover_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', storyId);

    if (updateError) {
      console.error('Failed to update story cover:', updateError);
      throw new Error('Failed to update story cover');
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cover selection updated successfully',
        selectedCoverUrl: coverOption.cover_url
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in select-story-cover function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});