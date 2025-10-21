import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    // Get topic ID (can be passed as param or default to Eastbourne)
    const { topicSlug = 'eastbourne' } = await req.json().catch(() => ({ topicSlug: 'eastbourne' }));

    console.log(`🧹 Starting parliamentary vote cleanup for topic: ${topicSlug}`);

    // Get topic
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name')
      .eq('slug', topicSlug)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicSlug}`);
    }

    console.log('📍 Topic found:', topic.name, topic.id);

    // Get tracked MPs for this topic
    const { data: trackedMPs, error: trackedMPsError } = await supabase
      .from('topic_tracked_mps')
      .select('mp_name, constituency, mp_id')
      .eq('topic_id', topic.id);

    if (trackedMPsError) {
      throw new Error(`Error fetching tracked MPs: ${trackedMPsError.message}`);
    }

    console.log('🗳️ Tracked MPs:', trackedMPs?.length || 0, trackedMPs);

    // Get all parliamentary stories for this topic (both legacy and multi-tenant)
    const { data: allStories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        article_id,
        topic_article_id,
        created_at,
        parliamentary_mentions (
          mp_name,
          constituency
        )
      `)
      .or(`article_id.in.(select id from articles where topic_id = ${topic.id}),topic_article_id.in.(select id from topic_articles where topic_id = ${topic.id})`)
      .not('parliamentary_mentions', 'is', null);

    if (storiesError) {
      console.error('❌ Error fetching stories:', storiesError);
      throw new Error(`Error fetching stories: ${storiesError.message}`);
    }

    console.log('📊 Total parliamentary stories found:', allStories?.length || 0);

    // Filter stories where MP is NOT in tracked list
    const storiesToDelete = (allStories || []).filter(story => {
      const mention = story.parliamentary_mentions?.[0];
      if (!mention || !mention.mp_name || !mention.constituency) return false; // No valid mention = skip

      const isTracked = trackedMPs?.some(mp => 
        mp.mp_name.toLowerCase().trim() === mention.mp_name.toLowerCase().trim() &&
        mp.constituency.toLowerCase().trim() === mention.constituency.toLowerCase().trim()
      );

      if (!isTracked) {
        console.log(`🚫 Story to delete (MP not tracked):`, {
          storyId: story.id,
          title: story.title,
          mp: mention.mp_name,
          constituency: mention.constituency
        });
      }

      return !isTracked;
    });

    console.log(`🎯 Stories to delete: ${storiesToDelete.length} out of ${allStories?.length || 0}`);

    // Delete them using the cascade delete function
    let deletedCount = 0;
    let errorCount = 0;

    for (const story of storiesToDelete) {
      try {
        const { error: deleteError } = await supabase.rpc('delete_story_cascade', {
          story_id_param: story.id
        });

        if (deleteError) {
          console.error(`❌ Error deleting story ${story.id}:`, deleteError);
          errorCount++;
        } else {
          console.log(`✅ Deleted story: ${story.title} (${story.id})`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`❌ Exception deleting story ${story.id}:`, error);
        errorCount++;
      }
    }

    const summary = {
      success: true,
      topicId: topic.id,
      topicName: topic.name,
      topicSlug,
      trackedMPs: trackedMPs?.length || 0,
      totalParliamentaryStories: allStories?.length || 0,
      storiesToDelete: storiesToDelete.length,
      deleted: deletedCount,
      errors: errorCount,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Cleanup summary:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Cleanup function error:', error);
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
