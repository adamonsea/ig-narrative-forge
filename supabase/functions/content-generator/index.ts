import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerationRequest {
  article_id?: string;
  topic_article_id?: string;
  shared_content_id?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🎬 Content generator starting...');

    const request: GenerationRequest = await req.json();
    console.log('📝 Generation request:', request);

    let articleContent: any = null;
    let articleId = request.article_id;

    // Get article content - support both legacy and multi-tenant systems
    if (request.shared_content_id) {
      // Multi-tenant system
      const { data: sharedContent, error: sharedError } = await supabase
        .from('shared_article_content')
        .select('*')
        .eq('id', request.shared_content_id)
        .single();

      if (sharedError || !sharedContent) {
        throw new Error(`Failed to fetch shared content: ${sharedError?.message}`);
      }

      const { data: topicArticle, error: topicError } = await supabase
        .from('topic_articles')
        .select('*')
        .eq('id', request.topic_article_id)
        .single();

      if (topicError || !topicArticle) {
        throw new Error(`Failed to fetch topic article: ${topicError?.message}`);
      }

      articleContent = {
        ...sharedContent,
        ...topicArticle,
        id: request.topic_article_id
      };
      articleId = request.topic_article_id;
    } else if (request.article_id) {
      // Legacy system
      const { data: article, error: articleError } = await supabase
        .from('articles')
        .select('*')
        .eq('id', request.article_id)
        .single();

      if (articleError || !article) {
        throw new Error(`Failed to fetch article: ${articleError?.message}`);
      }
      
      articleContent = article;
    } else {
      throw new Error('No article identifier provided');
    }

    console.log('📖 Article loaded:', articleContent.title);

    // Generate story content (simplified for now)
    const story = {
      title: articleContent.title,
      summary: articleContent.body?.substring(0, 500) + '...',
      source_attribution: {
        title: articleContent.title,
        url: articleContent.url || articleContent.source_url,
        author: articleContent.author,
        published_at: articleContent.published_at
      }
    };

    // Create slides based on slidetype
    let slides = [];
    const slideCount = request.slidetype === 'short' ? 3 : 
                     request.slidetype === 'extensive' ? 8 : 5;

    for (let i = 0; i < slideCount; i++) {
      slides.push({
        slide_number: i + 1,
        content: {
          headline: i === 0 ? articleContent.title : `Key Point ${i}`,
          body_text: articleContent.body?.split('.').slice(i * 2, (i + 1) * 2).join('.') || 'Content coming soon...'
        },
        slide_type: i === 0 ? 'title' : 'content'
      });
    }

    // Create the story record
    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .insert({
        article_id: request.article_id,
        topic_article_id: request.topic_article_id,
        shared_content_id: request.shared_content_id,
        status: 'ready',
        content: story,
        slides_data: slides
      })
      .select()
      .single();

    if (storyError) {
      throw new Error(`Failed to create story: ${storyError.message}`);
    }

    console.log('✅ Story created:', storyData.id);

    // Create slide records
    for (const slide of slides) {
      const { error: slideError } = await supabase
        .from('slides')
        .insert({
          story_id: storyData.id,
          slide_number: slide.slide_number,
          content: slide.content,
          slide_type: slide.slide_type
        });

      if (slideError) {
        console.warn('⚠️ Failed to create slide:', slideError.message);
      }
    }

    // Update article status
    if (request.article_id) {
      await supabase
        .from('articles')
        .update({ processing_status: 'processed' })
        .eq('id', request.article_id);
    }

    if (request.topic_article_id) {
      await supabase
        .from('topic_articles')
        .update({ processing_status: 'processed' })
        .eq('id', request.topic_article_id);
    }

    console.log('🎉 Content generation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        story_id: storyData.id,
        slides_count: slides.length,
        message: 'Story generated successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Content generation failed:', error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});