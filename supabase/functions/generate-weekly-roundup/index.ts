import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
      .lte('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    const storyCount = stories?.length || 0;

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

    // Top 10 story preview slides
    const topStories = stories.slice(0, 10);
    topStories.forEach((story, index) => {
      slides.push({
        type: 'story_preview',
        story_id: story.id,
        content: `#${index + 1}: ${story.title}`
      });
    });

    // Stats slide
    slides.push({
      type: 'stats',
      content: `This week's highlights:\n\n${storyCount} stories published\n${topStories.length} featured stories\n${stories.length - topStories.length} more to explore`
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
        story_ids: stories.map(s => s.id),
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

    return new Response(JSON.stringify({
      success: true,
      roundup_id: roundup.id,
      story_count: storyCount,
      slide_count: slides.length
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
