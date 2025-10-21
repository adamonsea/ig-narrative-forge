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

    // First, check for stories with future publication dates
    const { data: readyStories, error: fetchError } = await supabase
      .from('stories')
      .select(`
        id, 
        title,
        article_id,
        topic_article_id
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

    // Check publication dates for each story
    const storiesToPublish: string[] = [];
    const futureStories: Array<{id: string; title: string; date: string}> = [];

    for (const story of readyStories) {
      if (story.article_id) {
        // Legacy article
        const { data: article } = await supabase
          .from('articles')
          .select('published_at')
          .eq('id', story.article_id)
          .single();
        
        if (article?.published_at) {
          const pubDate = new Date(article.published_at);
          if (pubDate > new Date()) {
            futureStories.push({ id: story.id, title: story.title, date: article.published_at });
            continue;
          }
        }
      } else if (story.topic_article_id) {
        // Multi-tenant article
        const { data: topicArticle } = await supabase
          .from('topic_articles')
          .select('shared_content_id')
          .eq('id', story.topic_article_id)
          .single();
        
        if (topicArticle?.shared_content_id) {
          const { data: content } = await supabase
            .from('shared_article_content')
            .select('published_at')
            .eq('id', topicArticle.shared_content_id)
            .single();
          
          if (content?.published_at) {
            const pubDate = new Date(content.published_at);
            if (pubDate > new Date()) {
              futureStories.push({ id: story.id, title: story.title, date: content.published_at });
              continue;
            }
          }
        }
      }
      
      storiesToPublish.push(story.id);
    }

    if (futureStories.length > 0) {
      console.warn('⚠️ Skipping future-dated stories:', futureStories);
    }

    if (storiesToPublish.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No stories to publish (all have future dates)',
          skippedStories: futureStories
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update only stories without future dates
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

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Published ${updatedCount} ready stories${futureStories.length > 0 ? `, skipped ${futureStories.length} future-dated stories` : ''}`,
        updatedStories: updatedStories?.map(s => ({ id: s.id, title: s.title })) || [],
        skippedStories: futureStories.length > 0 ? futureStories : undefined
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