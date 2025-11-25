import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrphanedStory {
  id: string;
  title: string;
  created_at: string;
  is_published: boolean;
  status: string;
  topic_article_id: string | null;
  article_id: string | null;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { topic_id } = await req.json();

    console.log('Detecting orphaned stories for topic:', topic_id);

    // Get all published stories for the topic
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        created_at,
        is_published,
        status,
        topic_article_id,
        article_id
      `)
      .or(`topic_article_id.in.(select id from topic_articles where topic_id=eq.${topic_id}),article_id.in.(select id from articles where topic_id=eq.${topic_id})`)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw storiesError;
    }

    console.log(`Found ${stories?.length || 0} published stories`);

    // Get stories returned by the RPC function
    const { data: rpcStories, error: rpcError } = await supabase
      .rpc('get_topic_stories_with_keywords', {
        p_topic_id: topic_id,
        p_limit: 1000,
      });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      throw rpcError;
    }

    const rpcStoryIds = new Set((rpcStories || []).map((s: any) => s.story_id));
    console.log(`RPC returned ${rpcStoryIds.size} unique stories`);

    // Find orphaned stories
    const orphanedStories: OrphanedStory[] = [];

    for (const story of stories || []) {
      if (!rpcStoryIds.has(story.id)) {
        let reason = 'Unknown';

        // Check various reasons why it might be excluded
        if (!story.is_published) {
          reason = 'Not published';
        } else if (story.status !== 'ready' && story.status !== 'published') {
          reason = `Invalid status: ${story.status}`;
        } else if (!story.topic_article_id && !story.article_id) {
          reason = 'No article linkage';
        } else {
          // Check if the linked article/topic_article exists and is valid
          if (story.topic_article_id) {
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('id, shared_content_id')
              .eq('id', story.topic_article_id)
              .maybeSingle();

            if (!topicArticle) {
              reason = 'Missing topic_article';
            } else if (!topicArticle.shared_content_id) {
              reason = 'topic_article missing shared_content_id';
            }
          } else if (story.article_id) {
            const { data: article } = await supabase
              .from('articles')
              .select('id, source_url')
              .eq('id', story.article_id)
              .maybeSingle();

            if (!article) {
              reason = 'Missing article';
            }
          }
        }

        orphanedStories.push({
          id: story.id,
          title: story.title,
          created_at: story.created_at,
          is_published: story.is_published,
          status: story.status,
          topic_article_id: story.topic_article_id,
          article_id: story.article_id,
          reason,
        });
      }
    }

    console.log(`Found ${orphanedStories.length} orphaned stories`);

    return new Response(
      JSON.stringify({
        success: true,
        total_published: stories?.length || 0,
        in_feed: rpcStoryIds.size,
        orphaned: orphanedStories.length,
        orphaned_stories: orphanedStories,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error detecting orphaned stories:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
