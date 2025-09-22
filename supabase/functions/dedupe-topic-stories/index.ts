import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { topicId } = await req.json();

    if (!topicId) {
      throw new Error('Topic ID is required');
    }

    console.log('🔍 Finding duplicate stories for topic:', topicId);

    // Get all stories for this topic with their article titles  
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        headline,
        created_at,
        status,
        is_published,
        topic_article_id,
        topic_article:topic_articles!inner(
          id, topic_id,
          shared_content:shared_article_content(title, url)
        )
      `)
      .eq('topic_articles.topic_id', topicId)
      .order('created_at', { ascending: false });

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    if (!stories || stories.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No stories found for this topic',
          duplicatesRemoved: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group stories by normalized title to find duplicates
    const titleGroups: { [key: string]: any[] } = {};
    stories.forEach(story => {
      const title = story.topic_article?.shared_content?.title || story.headline || '';
      const normalizedTitle = title.toLowerCase().trim();
      
      if (!titleGroups[normalizedTitle]) {
        titleGroups[normalizedTitle] = [];
      }
      titleGroups[normalizedTitle].push(story);
    });

    // Find duplicates and select which ones to keep/remove
    const storiesToArchive: string[] = [];
    let duplicatesFound = 0;

    Object.entries(titleGroups).forEach(([title, group]) => {
      if (group.length > 1) {
        duplicatesFound += group.length - 1;
        console.log(`🔄 Found ${group.length} duplicates for: \"${title}\"`);
        
        // Sort by preference: published > multi-tenant > newer
        group.sort((a, b) => {
          // First priority: published stories
          if (a.is_published && !b.is_published) return -1;
          if (!a.is_published && b.is_published) return 1;
          
          // Second priority: creation date (newer first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        // Keep the first one, archive the rest
        const [keep, ...remove] = group;
        console.log(`✅ Keeping story: ${keep.id} (${keep.is_published ? 'published' : 'unpublished'})`);
        
        remove.forEach(story => {
          console.log(`🗑️ Archiving duplicate: ${story.id} (${story.is_published ? 'published' : 'unpublished'})`);
          storiesToArchive.push(story.id);
        });
      }
    });

    if (storiesToArchive.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No duplicates found',
          duplicatesRemoved: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Archive duplicate stories
    const { error: archiveError } = await supabase
      .from('stories')
      .update({
        status: 'archived',
        is_published: false
      })
      .in('id', storiesToArchive);

    if (archiveError) {
      throw new Error(`Failed to archive duplicates: ${archiveError.message}`);
    }

    console.log(`✅ Successfully archived ${storiesToArchive.length} duplicate stories`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Archived ${storiesToArchive.length} duplicate stories`,
        duplicatesRemoved: storiesToArchive.length,
        duplicatesFound: duplicatesFound
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in dedupe-topic-stories function:', error);
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
