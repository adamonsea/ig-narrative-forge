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
    const { topic_id, date } = body;
    
    // If no topic_id provided, generate for all active topics
    if (!topic_id) {
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, slug')
        .eq('is_active', true);

      if (topicsError || !topics || topics.length === 0) {
        throw new Error('No active topics found');
      }

      console.log(`📰 Generating daily roundups for ${topics.length} topics on ${date}`);

      const results = [];
      for (const topic of topics) {
        try {
          const response = await supabase.functions.invoke('generate-daily-roundup', {
            body: { topic_id: topic.id, date }
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
    
    console.log(`📰 Generating daily roundup for topic ${topic_id} on ${date}`);

    // Get topic info
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug')
      .eq('id', topic_id)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Parse date to get start and end of day
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Get all published stories for this day and topic
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
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    const storyCount = stories?.length || 0;

    if (storyCount === 0) {
      console.log('⏭️ No stories found for this day, skipping roundup generation');
      return new Response(JSON.stringify({
        success: true,
        message: 'No stories found for this day',
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
      content: `Today in ${topic.name}\n\n${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`
    });

    // Story preview slides (first 5 stories)
    const previewStories = stories.slice(0, 5);
    previewStories.forEach((story) => {
      slides.push({
        type: 'story_preview',
        story_id: story.id,
        content: story.title,
        author: story.author,
        publication_name: story.publication_name,
        source_metadata: {
          author: story.author,
          publication: story.publication_name
        }
      });
    });

    // Outro slide
    slides.push({
      type: 'outro',
      content: `That's today's ${topic.name} in brief.\n\nTap below for more stories.`
    });

    // Create or update roundup
    const { data: roundup, error: roundupError } = await supabase
      .from('topic_roundups')
      .upsert({
        topic_id,
        roundup_type: 'daily',
        period_start: startOfDay.toISOString(),
        period_end: endOfDay.toISOString(),
        story_ids: stories.map(s => s.id),
        slide_data: slides,
        stats: {
          story_count: storyCount,
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

    console.log(`✅ Daily roundup generated: ${roundup.id} with ${storyCount} stories`);

    // Check if audio briefing is enabled for this topic
    const { data: topicSettings } = await supabase
      .from('topics')
      .select('audio_briefings_daily_enabled')
      .eq('id', topic_id)
      .single();

    let audioGenerated = false;
    if (topicSettings?.audio_briefings_daily_enabled) {
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
    console.error('💥 Daily roundup generation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
