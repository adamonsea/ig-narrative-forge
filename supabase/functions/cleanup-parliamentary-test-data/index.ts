import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Cleaning up simulated parliamentary data...');

    // Get all parliamentary mentions with fake URLs
    const { data: fakeMentions, error: fetchError } = await supabase
      .from('parliamentary_mentions')
      .select('id, story_id, vote_url, hansard_url')
      .or('vote_url.like.%hansard.parliament.uk/commons/vote/%,hansard_url.like.%hansard.parliament.uk/search%');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${fakeMentions?.length || 0} simulated mentions to clean`);

    let deletedStories = 0;
    let deletedSharedContent = 0;
    let deletedMentions = 0;

    // Delete related stories and content
    for (const mention of fakeMentions || []) {
      if (mention.story_id) {
        // Get the story to find shared_content_id
        const { data: story } = await supabase
          .from('stories')
          .select('shared_content_id, topic_article_id')
          .eq('id', mention.story_id)
          .single();

        if (story) {
          // Delete slides first
          await supabase
            .from('slides')
            .delete()
            .eq('story_id', mention.story_id);

          // Delete story
          await supabase
            .from('stories')
            .delete()
            .eq('id', mention.story_id);
          deletedStories++;

          // Delete topic_article
          if (story.topic_article_id) {
            await supabase
              .from('topic_articles')
              .delete()
              .eq('id', story.topic_article_id);
          }

          // Delete shared content
          if (story.shared_content_id) {
            await supabase
              .from('shared_article_content')
              .delete()
              .eq('id', story.shared_content_id);
            deletedSharedContent++;
          }
        }
      }

      // Delete the mention itself
      const { error: deleteError } = await supabase
        .from('parliamentary_mentions')
        .delete()
        .eq('id', mention.id);

      if (!deleteError) {
        deletedMentions++;
      }
    }

    console.log(`✅ Cleanup complete: ${deletedMentions} mentions, ${deletedStories} stories, ${deletedSharedContent} shared content`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: {
          mentions: deletedMentions,
          stories: deletedStories,
          sharedContent: deletedSharedContent
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
