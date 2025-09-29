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
    const { coverOptionId } = await req.json();

    if (!coverOptionId) {
      throw new Error('Cover option ID is required');
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

    // Get cover option with story details
    const { data: coverOption, error: coverError } = await supabase
      .from('story_cover_options')
      .select(`
        id,
        story_id,
        cover_url,
        stories!inner(
          id,
          selected_cover_id,
          article_id,
          topic_article_id,
          articles(topic_id, topics(created_by)),
          topic_articles(topic_id, topics(created_by))
        )
      `)
      .eq('id', coverOptionId)
      .single();

    if (coverError || !coverOption) {
      throw new Error('Cover option not found');
    }

    // Check ownership
    const story = coverOption.stories;
    const topicCreatedBy = story.article_id 
      ? story.articles?.topics?.created_by
      : story.topic_articles?.topics?.created_by;

    if (topicCreatedBy !== user.id) {
      throw new Error('Access denied');
    }

    // Check if this is the currently selected cover
    const isCurrentlySelected = story.selected_cover_id === coverOptionId;

    // Count remaining cover options for this story
    const { count: remainingCount } = await supabase
      .from('story_cover_options')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', coverOption.story_id)
      .neq('id', coverOptionId);

    if (remainingCount === 0) {
      throw new Error('Cannot delete the last remaining cover option');
    }

    // If this is the selected cover, we need to select a different one
    if (isCurrentlySelected) {
      // Find another cover option to use as the new selected one
      const { data: newSelectedCover, error: newCoverError } = await supabase
        .from('story_cover_options')
        .select('*')
        .eq('story_id', coverOption.story_id)
        .neq('id', coverOptionId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (newCoverError || !newSelectedCover) {
        throw new Error('Failed to find alternative cover option');
      }

      // Update story to use the new selected cover
      const { error: updateError } = await supabase
        .from('stories')
        .update({
          selected_cover_id: newSelectedCover.id,
          cover_illustration_url: newSelectedCover.cover_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', coverOption.story_id);

      if (updateError) {
        console.error('Failed to update story with new selected cover:', updateError);
        throw new Error('Failed to update story with new selected cover');
      }
    }

    // Delete the cover option
    const { error: deleteError } = await supabase
      .from('story_cover_options')
      .delete()
      .eq('id', coverOptionId);

    if (deleteError) {
      console.error('Failed to delete cover option:', deleteError);
      throw new Error('Failed to delete cover option');
    }

    // TODO: Delete the actual image file from storage if needed
    // This would require extracting the file path from cover_url and calling storage.remove()

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cover option deleted successfully',
        wasSelected: isCurrentlySelected
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in delete-cover-option function:', error);
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