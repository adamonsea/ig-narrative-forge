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
    const { topicArticleId } = await req.json();

    if (!topicArticleId) {
      throw new Error('Topic article ID is required');
    }

    console.log('Promoting topic article:', topicArticleId);

    // Get the topic article and its shared content
    const { data: topicArticle, error: topicArticleError } = await supabase
      .from('topic_articles')
      .select(`
        *,
        shared_article_content (*)
      `)
      .eq('id', topicArticleId)
      .single();

    if (topicArticleError || !topicArticle) {
      throw new Error(`Failed to fetch topic article: ${topicArticleError?.message}`);
    }

    const sharedContent = topicArticle.shared_article_content;
    if (!sharedContent) {
      throw new Error('No shared content found for topic article');
    }

    console.log('Found topic article:', topicArticle.id, 'with shared content:', sharedContent.id);

    // Check if already promoted
    const { data: existingArticle } = await supabase
      .from('articles')
      .select('id')
      .eq('source_url', sharedContent.url)
      .eq('topic_id', topicArticle.topic_id)
      .single();

    if (existingArticle) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Article already exists in published queue',
          articleId: existingArticle.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new article in main articles table
    const { data: newArticle, error: insertError } = await supabase
      .from('articles')
      .insert({
        topic_id: topicArticle.topic_id,
        source_id: topicArticle.source_id,
        source_url: sharedContent.url,
        title: sharedContent.title,
        body: sharedContent.body,
        author: sharedContent.author,
        image_url: sharedContent.image_url,
        published_at: sharedContent.published_at,
        word_count: sharedContent.word_count,
        language: sharedContent.language,
        source_domain: sharedContent.source_domain,
        content_checksum: sharedContent.content_checksum,
        canonical_url: sharedContent.canonical_url,
        processing_status: 'processed',
        regional_relevance_score: topicArticle.regional_relevance_score,
        content_quality_score: topicArticle.content_quality_score,
        originality_confidence: topicArticle.originality_confidence,
        keyword_matches: topicArticle.keyword_matches,
        import_metadata: {
          ...topicArticle.import_metadata,
          promoted_from_topic_article: true,
          promoted_at: new Date().toISOString(),
          original_topic_article_id: topicArticle.id
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create article:', insertError);
      throw new Error(`Failed to create article: ${insertError.message}`);
    }

    console.log('Created new article:', newArticle.id);

    // Mark topic article as promoted
    const { error: updateError } = await supabase
      .from('topic_articles')
      .update({
        processing_status: 'promoted',
        import_metadata: {
          ...topicArticle.import_metadata,
          promoted_to_article_id: newArticle.id,
          promoted_at: new Date().toISOString()
        }
      })
      .eq('id', topicArticleId);

    if (updateError) {
      console.error('Failed to update topic article status:', updateError);
      // Don't fail the whole operation, just log it
    }

    // Log the promotion
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Topic article promoted to published queue',
        context: {
          topic_article_id: topicArticleId,
          new_article_id: newArticle.id,
          topic_id: topicArticle.topic_id,
          title: sharedContent.title
        },
        function_name: 'promote-topic-article'
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        articleId: newArticle.id,
        title: newArticle.title,
        message: 'Article promoted to published queue successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in promote-topic-article function:', error);
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