import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { topic_id, week_start } = body;
    
    // If no topic_id provided, generate for all active topics
    if (!topic_id) {
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, slug')
        .eq('is_active', true);

      if (topicsError || !topics || topics.length === 0) {
        throw new Error('No active topics found');
      }

      console.log(`📰 Generating weekly roundups for ${topics.length} topics starting ${week_start}`);

      const results = [];
      for (const topic of topics) {
        try {
          const response = await supabase.functions.invoke('generate-weekly-roundup', {
            body: { topic_id: topic.id, week_start }
          });
          results.push({ topic: topic.name, success: true, ...response.data });
        } catch (error) {
          console.error(`Failed to generate roundup for ${topic.name}:`, error);
          results.push({ topic: topic.name, success: false, error: error.message });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Generated roundups for ${results.filter(r => r.success).length}/${topics.length} topics`,
        results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`📰 Generating weekly roundup for topic ${topic_id} starting ${week_start}`);

    // Get topic info
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug')
      .eq('id', topic_id)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Parse week dates (Monday to Sunday)
    const weekStartDate = new Date(week_start);
    const weekStart = new Date(weekStartDate.setHours(0, 0, 0, 0));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Get all published stories for this week and topic
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id, title, author, publication_name, created_at,
        topic_article_id,
        topic_articles!inner(topic_id)
      `)
      .eq('topic_articles.topic_id', topic_id)
      .eq('is_published', true)
      .in('status', ['ready', 'published'])
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString());

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    const storyCount = stories?.length || 0;

    // Get engagement counts for these stories (sort by popularity)
    let sortedStories = stories || [];
    if (storyCount > 0) {
      const storyIds = stories!.map(s => s.id);
      const { data: engagementData } = await supabase
        .from('story_interactions')
        .select('story_id')
        .in('story_id', storyIds)
        .eq('interaction_type', 'swipe');

      // Count swipes per story
      const swipeCountMap = new Map<string, number>();
      engagementData?.forEach(row => {
        swipeCountMap.set(row.story_id, (swipeCountMap.get(row.story_id) || 0) + 1);
      });

      // Sort by swipe count (popularity), fallback to newest
      sortedStories = [...stories!].sort((a, b) => {
        const aSwipes = swipeCountMap.get(a.id) || 0;
        const bSwipes = swipeCountMap.get(b.id) || 0;
        if (bSwipes !== aSwipes) return bSwipes - aSwipes;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      console.log(`📊 Top story by engagement: "${sortedStories[0]?.title}" with ${swipeCountMap.get(sortedStories[0]?.id) || 0} swipes`);
    }

    if (storyCount === 0) {
      console.log('⏭️ No stories found for this week, skipping roundup generation');
      return new Response(JSON.stringify({
        success: true,
        message: 'No stories found for this week',
        story_count: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate slide data
    const slides = [];

    // Hero slide
    slides.push({
      type: 'hero',
      content: `Your Week in ${topic.name}\n\n${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`
    });

    // Top 10 story preview slides (sorted by popularity)
    const topStories = sortedStories.slice(0, 10);
    topStories.forEach((story, index) => {
      slides.push({
        type: 'story_preview',
        story_id: story.id,
        content: `#${index + 1}: ${story.title}`,
        author: story.author,
        publication_name: story.publication_name,
        source_metadata: {
          author: story.author,
          publication: story.publication_name
        }
      });
    });

    // Stats slide
    slides.push({
      type: 'stats',
      content: `This week's highlights:\n\n${storyCount} stories published\n${topStories.length} featured stories\n${sortedStories.length - topStories.length} more to explore`
    });

    // Outro slide
    slides.push({
      type: 'outro',
      content: `That's your week in ${topic.name}.\n\nTap below to browse all stories.`
    });

    // Create or update roundup
    const { data: roundup, error: roundupError } = await supabase
      .from('topic_roundups')
      .upsert({
        topic_id,
        roundup_type: 'weekly',
        period_start: weekStart.toISOString(),
        period_end: weekEnd.toISOString(),
        story_ids: sortedStories.map(s => s.id),
        slide_data: slides,
        stats: {
          story_count: storyCount,
          top_story_count: topStories.length,
          generated_at: new Date().toISOString()
        },
        is_published: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'topic_id,roundup_type,period_start'
      })
      .select()
      .single();

    if (roundupError) {
      throw new Error(`Failed to save roundup: ${roundupError.message}`);
    }

    console.log(`✅ Weekly roundup generated: ${roundup.id} with ${storyCount} stories`);

    // Check if audio briefing is enabled for this topic
    const { data: topicSettings } = await supabase
      .from('topics')
      .select('audio_briefings_weekly_enabled')
      .eq('id', topic_id)
      .single();

    let audioGenerated = false;
    if (topicSettings?.audio_briefings_weekly_enabled) {
      console.log('🎙️ Audio briefing enabled, triggering generation...');
      try {
        const audioResponse = await supabase.functions.invoke('generate-audio-briefing', {
          body: { roundupId: roundup.id }
        });
        audioGenerated = audioResponse.data?.success === true;
        console.log(`🎙️ Audio generation ${audioGenerated ? 'succeeded' : 'skipped/failed'}`);
      } catch (audioError) {
        console.warn('⚠️ Audio generation failed (non-blocking):', audioError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      roundup_id: roundup.id,
      story_count: storyCount,
      slide_count: slides.length,
      audio_generated: audioGenerated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Weekly roundup generation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
