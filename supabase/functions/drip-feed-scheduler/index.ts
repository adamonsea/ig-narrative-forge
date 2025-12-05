import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DripFeedTopic {
  id: string;
  name: string;
  drip_feed_enabled: boolean;
  drip_release_interval_hours: number;
  drip_stories_per_release: number;
  drip_start_hour: number;
  drip_end_hour: number;
}

interface ReadyStory {
  id: string;
  title: string;
  scheduled_publish_at: string | null;
  drip_queued_at: string | null;
  topic_article_id: string | null;
  article_id: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const logs: string[] = [];
  const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
    console.log(entry);
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parse request body for optional topic_id filter
    let targetTopicId: string | null = null;
    let emergencyPublishAll = false;
    try {
      const body = await req.json();
      targetTopicId = body.topic_id || null;
      emergencyPublishAll = body.emergency_publish_all === true;
    } catch {
      // No body or invalid JSON - that's fine
    }

    log('🕐 Drip Feed Scheduler starting...');

    // Emergency publish all - bypass drip feed for a topic
    if (emergencyPublishAll && targetTopicId) {
      log(`🚨 EMERGENCY: Publishing all ready stories for topic ${targetTopicId}`);
      
      // Get all ready stories for this topic with scheduled times
      const { data: emergencyStories, error: emergencyError } = await supabase
        .from('stories')
        .select('id, title, topic_article_id')
        .eq('status', 'ready')
        .not('scheduled_publish_at', 'is', null);

      if (emergencyError) {
        throw new Error(`Failed to fetch emergency stories: ${emergencyError.message}`);
      }

      // Filter to only stories from this topic
      const topicStoryIds: string[] = [];
      for (const story of emergencyStories || []) {
        if (story.topic_article_id) {
          const { data: ta } = await supabase
            .from('topic_articles')
            .select('topic_id')
            .eq('id', story.topic_article_id)
            .single();
          
          if (ta?.topic_id === targetTopicId) {
            topicStoryIds.push(story.id);
          }
        }
      }

      if (topicStoryIds.length > 0) {
        // Clear scheduled_publish_at to allow immediate publishing
        const { error: clearError } = await supabase
          .from('stories')
          .update({ scheduled_publish_at: null })
          .in('id', topicStoryIds);

        if (clearError) {
          throw new Error(`Failed to clear scheduled times: ${clearError.message}`);
        }

        log(`✅ Cleared scheduled times for ${topicStoryIds.length} stories - they will publish immediately`);
      }

      // Log the emergency action
      await supabase.from('system_logs').insert({
        level: 'warn',
        function_name: 'drip-feed-scheduler',
        message: `Emergency publish all triggered for topic`,
        context: { 
          topic_id: targetTopicId, 
          stories_released: topicStoryIds.length,
          triggered_at: new Date().toISOString()
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          emergency: true,
          stories_released: topicStoryIds.length,
          message: `Released ${topicStoryIds.length} stories for immediate publishing`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get topics with drip feed enabled
    const topicQuery = supabase
      .from('topics')
      .select('id, name, drip_feed_enabled, drip_release_interval_hours, drip_stories_per_release, drip_start_hour, drip_end_hour')
      .eq('drip_feed_enabled', true)
      .eq('is_active', true);

    if (targetTopicId) {
      topicQuery.eq('id', targetTopicId);
    }

    const { data: topics, error: topicsError } = await topicQuery;

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    if (!topics || topics.length === 0) {
      log('No topics with drip feed enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No drip feed topics found', logs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log(`Found ${topics.length} topic(s) with drip feed enabled`);

    const now = new Date();
    const currentHour = now.getUTCHours();
    const results: Array<{ topic: string; scheduled: number; skipped: string }> = [];

    for (const topic of topics as DripFeedTopic[]) {
      log(`\n📰 Processing topic: ${topic.name}`);
      
      // Check if we're within release hours
      const startHour = topic.drip_start_hour ?? 6;
      const endHour = topic.drip_end_hour ?? 22;
      
      const withinReleaseWindow = currentHour >= startHour && currentHour < endHour;
      
      if (!withinReleaseWindow) {
        log(`⏰ Outside release window (${startHour}:00 - ${endHour}:00 UTC), current: ${currentHour}:00`);
        results.push({ topic: topic.name, scheduled: 0, skipped: 'outside_release_window' });
        continue;
      }

      // Get ready stories for this topic that don't have scheduled_publish_at set
      const { data: readyStories, error: storiesError } = await supabase
        .from('stories')
        .select(`
          id, 
          title, 
          scheduled_publish_at,
          drip_queued_at,
          topic_article_id,
          article_id
        `)
        .eq('status', 'ready')
        .is('scheduled_publish_at', null)
        .order('created_at', { ascending: true });

      if (storiesError) {
        log(`❌ Error fetching stories: ${storiesError.message}`);
        continue;
      }

      // Filter stories to only those belonging to this topic
      const topicStories: ReadyStory[] = [];
      
      for (const story of readyStories || []) {
        if (story.topic_article_id) {
          // Multi-tenant architecture
          const { data: topicArticle } = await supabase
            .from('topic_articles')
            .select('topic_id')
            .eq('id', story.topic_article_id)
            .single();
          
          if (topicArticle?.topic_id === topic.id) {
            topicStories.push(story as ReadyStory);
          }
        } else if (story.article_id) {
          // Legacy architecture
          const { data: article } = await supabase
            .from('articles')
            .select('topic_id')
            .eq('id', story.article_id)
            .single();
          
          if (article?.topic_id === topic.id) {
            topicStories.push(story as ReadyStory);
          }
        }
      }

      if (topicStories.length === 0) {
        log(`No unscheduled ready stories for ${topic.name}`);
        results.push({ topic: topic.name, scheduled: 0, skipped: 'no_stories' });
        continue;
      }

      log(`Found ${topicStories.length} unscheduled ready stories`);

      // Calculate release slots for today
      const intervalHours = topic.drip_release_interval_hours ?? 4;
      const storiesPerRelease = topic.drip_stories_per_release ?? 2;
      
      // Calculate remaining slots today
      const hoursRemaining = endHour - currentHour;
      const slotsRemaining = Math.ceil(hoursRemaining / intervalHours);
      
      // Distribute stories across remaining slots
      const storiesToSchedule = topicStories.slice(0, slotsRemaining * storiesPerRelease);
      
      log(`Scheduling ${storiesToSchedule.length} stories across ${slotsRemaining} slots (${intervalHours}h intervals, ${storiesPerRelease} per slot)`);

      let scheduledCount = 0;
      let slotIndex = 0;

      for (let i = 0; i < storiesToSchedule.length; i++) {
        const story = storiesToSchedule[i];
        
        // Calculate which slot this story belongs to
        if (i > 0 && i % storiesPerRelease === 0) {
          slotIndex++;
        }

        // Calculate the scheduled time for this slot
        const scheduledTime = new Date(now);
        scheduledTime.setUTCHours(currentHour + (slotIndex * intervalHours), 0, 0, 0);
        
        // If first slot is current hour, schedule for next interval
        if (slotIndex === 0 && scheduledTime.getTime() <= now.getTime()) {
          scheduledTime.setUTCHours(scheduledTime.getUTCHours() + intervalHours);
        }

        const { error: updateError } = await supabase
          .from('stories')
          .update({ 
            scheduled_publish_at: scheduledTime.toISOString(),
            drip_queued_at: now.toISOString()
          })
          .eq('id', story.id);

        if (updateError) {
          log(`❌ Failed to schedule story ${story.id}: ${updateError.message}`);
          continue;
        }

        // Log each scheduled story to database
        await supabase.rpc('log_drip_feed_event', {
          p_topic_id: topic.id,
          p_event_type: 'story_scheduled',
          p_story_id: story.id,
          p_details: {
            title: story.title,
            scheduled_for: scheduledTime.toISOString(),
            slot_index: slotIndex
          }
        });

        log(`📅 Scheduled "${story.title?.substring(0, 40)}..." for ${scheduledTime.toISOString()}`);
        scheduledCount++;
      }

      results.push({ topic: topic.name, scheduled: scheduledCount, skipped: '' });
      log(`✅ Scheduled ${scheduledCount} stories for ${topic.name}`);
    }

    // Calculate totals for summary
    const totalScheduled = results.reduce((sum, r) => sum + r.scheduled, 0);
    const topicsProcessed = results.filter(r => r.scheduled > 0).length;
    const topicsSkipped = results.filter(r => r.skipped).length;

    // Log detailed summary to system_logs
    await supabase.from('system_logs').insert({
      level: 'info',
      function_name: 'drip-feed-scheduler',
      message: `Drip feed scheduler completed: ${totalScheduled} stories scheduled across ${topicsProcessed} topics`,
      context: { 
        results,
        summary: {
          total_stories_scheduled: totalScheduled,
          topics_processed: topicsProcessed,
          topics_skipped: topicsSkipped,
          trigger_source: targetTopicId ? 'story_ready_trigger' : 'cron_job'
        },
        duration_ms: Date.now() - startTime,
        current_hour_utc: currentHour,
        run_timestamp: new Date().toISOString()
      }
    });

    log(`\n📊 Summary: ${totalScheduled} stories scheduled, ${topicsProcessed} topics processed, ${topicsSkipped} skipped`);

    log(`\n✅ Drip Feed Scheduler completed in ${Date.now() - startTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        duration_ms: Date.now() - startTime,
        logs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ Fatal error: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        logs 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
