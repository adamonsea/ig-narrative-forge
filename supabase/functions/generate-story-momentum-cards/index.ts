import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId } = await req.json();

    if (!topicId) {
      throw new Error('topicId is required');
    }

    console.log(`📈 Generating Story Momentum card for topic: ${topicId}`);

    // Get topic info
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Get top 3 trending stories from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: trendingStories, error: storiesError } = await supabase
      .from('story_interactions')
      .select(`
        story_id,
        stories!inner(
          id,
          title,
          slug,
          published_at,
          article_id,
          topic_article_id
        )
      `)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw new Error(`Failed to fetch trending stories: ${storiesError.message}`);
    }

    // Count interactions per story
    const storyInteractions = new Map<string, { story: any; count: number; latestInteraction: string }>();
    
    for (const interaction of trendingStories || []) {
      if (!interaction.stories) continue;
      
      const storyId = interaction.story_id;
      const existing = storyInteractions.get(storyId);
      
      if (existing) {
        existing.count++;
      } else {
        storyInteractions.set(storyId, {
          story: interaction.stories,
          count: 1,
          latestInteraction: interaction.created_at
        });
      }
    }

    // Filter stories that belong to this topic
    const topicStories = Array.from(storyInteractions.values()).filter(({ story }) => {
      // Check both legacy (article_id) and multi-tenant (topic_article_id) paths
      return story.article_id || story.topic_article_id;
    });

    // Sort by interaction count
    const top3 = topicStories
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    console.log(`  Found ${top3.length} trending stories`);

    if (top3.length === 0) {
      console.log(`  No trending stories found - skipping card generation`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No trending stories to display',
          cardsGenerated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build slides
    const slides = [
      {
        type: 'hook',
        content: '📈 **Trending Now**',
        word_count: 2
      },
      ...top3.map(({ story, count }) => {
        const timeAgo = getTimeAgo(story.published_at);
        return {
          type: 'content',
          content: `**${story.title}**\n\n🔥 ${count} ${count === 1 ? 'reader' : 'readers'} engaged • Published ${timeAgo}`,
          word_count: story.title.split(' ').length + 10,
          metadata: {
            storyId: story.id,
            storySlug: story.slug,
            interactions: count
          }
        };
      })
    ];

    // Calculate relevance score based on total interactions
    const totalInteractions = top3.reduce((sum, { count }) => sum + count, 0);
    const relevanceScore = Math.min(100, 50 + totalInteractions * 5); // Base 50, +5 per interaction, max 100

    // Create the card
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const { error: insertError } = await supabase
      .from('automated_insight_cards')
      .insert({
        topic_id: topicId,
        card_type: 'story_momentum',
        headline: 'Trending Now',
        insight_data: {
          topicName: topic.name,
          storiesCount: top3.length,
          totalInteractions,
          generatedAt: new Date().toISOString()
        },
        slides,
        relevance_score: relevanceScore,
        display_frequency: 6, // Show every 6 stories
        valid_until: validUntil.toISOString(),
        is_published: true,
        is_visible: true
      });

    if (insertError) {
      throw new Error(`Failed to insert card: ${insertError.message}`);
    }

    console.log(`✅ Story Momentum card created (relevance: ${relevanceScore})`);

    return new Response(
      JSON.stringify({ 
        success: true,
        cardsGenerated: 1,
        relevanceScore,
        storiesIncluded: top3.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Generation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

function getTimeAgo(publishedAt: string): string {
  const now = Date.now();
  const published = new Date(publishedAt).getTime();
  const diffMs = now - published;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else {
    return 'just now';
  }
}
