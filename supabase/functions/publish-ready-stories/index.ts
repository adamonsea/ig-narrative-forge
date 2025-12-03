import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

    console.log('📢 Converting ready stories to published status...');

    // First, fetch topics with drip feed enabled to know which topics should hold stories
    const { data: dripFeedTopics, error: topicsError } = await supabase
      .from('topics')
      .select('id')
      .eq('drip_feed_enabled', true);

    if (topicsError) {
      console.error('Error fetching drip feed topics:', topicsError);
    }

    const dripFeedTopicIds = new Set((dripFeedTopics || []).map(t => t.id));
    console.log(`💧 ${dripFeedTopicIds.size} topics have drip feed enabled`);

    // Fetch ready stories with topic info
    const { data: readyStories, error: fetchError } = await supabase
      .from('stories')
      .select(`
        id, 
        title,
        article_id,
        topic_article_id,
        scheduled_publish_at
      `)
      .eq('status', 'ready');

    if (fetchError) {
      console.error('Error fetching ready stories:', fetchError);
      throw new Error(`Failed to fetch stories: ${fetchError.message}`);
    }

    if (!readyStories || readyStories.length === 0) {
      console.log('No ready stories to publish');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No ready stories to publish',
          updatedStories: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check publication dates and drip feed status for each story
    const storiesToPublish: string[] = [];
    const futureStories: Array<{id: string; title: string; date: string; reason: string}> = [];
    const dripQueuedStories: Array<{id: string; title: string; scheduled_at: string | null; reason: string}> = [];

    for (const story of readyStories) {
      // Get the topic ID for this story
      let topicId: string | null = null;
      
      if (story.topic_article_id) {
        const { data: topicArticle } = await supabase
          .from('topic_articles')
          .select('topic_id, shared_content_id')
          .eq('id', story.topic_article_id)
          .single();
        
        topicId = topicArticle?.topic_id || null;
        
        // Check for future article date
        if (topicArticle?.shared_content_id) {
          const { data: content } = await supabase
            .from('shared_article_content')
            .select('published_at')
            .eq('id', topicArticle.shared_content_id)
            .single();
          
          if (content?.published_at) {
            const pubDate = new Date(content.published_at);
            if (pubDate > new Date()) {
              futureStories.push({ id: story.id, title: story.title, date: content.published_at, reason: 'future_article_date' });
              continue;
            }
          }
        }
      } else if (story.article_id) {
        // Legacy article path
        const { data: article } = await supabase
          .from('articles')
          .select('published_at, topic_id')
          .eq('id', story.article_id)
          .single();
        
        topicId = article?.topic_id || null;
        
        if (article?.published_at) {
          const pubDate = new Date(article.published_at);
          if (pubDate > new Date()) {
            futureStories.push({ id: story.id, title: story.title, date: article.published_at, reason: 'future_article_date' });
            continue;
          }
        }
      }

      // DRIP FEED CHECK: If topic has drip feed enabled
      const isDripFeedTopic = topicId && dripFeedTopicIds.has(topicId);
      
      if (isDripFeedTopic) {
        // If story has scheduled_publish_at, check if it's in the future
        if (story.scheduled_publish_at) {
          const scheduledTime = new Date(story.scheduled_publish_at);
          if (scheduledTime > new Date()) {
            dripQueuedStories.push({ 
              id: story.id, 
              title: story.title, 
              scheduled_at: story.scheduled_publish_at,
              reason: 'scheduled_for_future'
            });
            console.log(`⏰ Drip feed: Holding "${story.title}" until ${story.scheduled_publish_at}`);
            continue;
          }
          // scheduled_publish_at is in the past, okay to publish
        } else {
          // NO scheduled_publish_at but drip feed is enabled - HOLD the story
          // Scheduler hasn't assigned a time yet, don't publish prematurely
          dripQueuedStories.push({ 
            id: story.id, 
            title: story.title, 
            scheduled_at: null,
            reason: 'awaiting_drip_schedule'
          });
          console.log(`⏳ Drip feed: Holding "${story.title}" - awaiting scheduler to assign time`);
          continue;
        }
      }
      
      storiesToPublish.push(story.id);
    }

    if (futureStories.length > 0) {
      console.warn('⚠️ Skipping future-dated stories:', futureStories);
    }

    if (dripQueuedStories.length > 0) {
      const scheduledCount = dripQueuedStories.filter(s => s.reason === 'scheduled_for_future').length;
      const awaitingCount = dripQueuedStories.filter(s => s.reason === 'awaiting_drip_schedule').length;
      console.log(`💧 Drip feed: ${scheduledCount} stories scheduled, ${awaitingCount} awaiting scheduler`);
    }

    if (storiesToPublish.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No stories to publish (all have future dates or are drip queued)',
          skippedStories: futureStories,
          dripQueuedStories: dripQueuedStories
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update only stories that passed all checks
    const { data: updatedStories, error: updateError } = await supabase
      .from('stories')
      .update({
        status: 'published',
        is_published: true
      })
      .in('id', storiesToPublish)
      .select('id, title');

    if (updateError) {
      console.error('Error updating ready stories:', updateError);
      throw new Error(`Failed to update stories: ${updateError.message}`);
    }

    const updatedCount = updatedStories?.length || 0;
    console.log(`✅ Successfully published ${updatedCount} ready stories`);
    
    if (dripQueuedStories.length > 0) {
      console.log(`💧 ${dripQueuedStories.length} stories remain in drip queue`);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Published ${updatedCount} ready stories${futureStories.length > 0 ? `, skipped ${futureStories.length} future-dated stories` : ''}${dripQueuedStories.length > 0 ? `, ${dripQueuedStories.length} in drip queue` : ''}`,
        updatedStories: updatedStories?.map(s => ({ id: s.id, title: s.title })) || [],
        skippedStories: futureStories.length > 0 ? futureStories : undefined,
        dripQueuedStories: dripQueuedStories.length > 0 ? dripQueuedStories : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in publish-ready-stories function:', error);
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
