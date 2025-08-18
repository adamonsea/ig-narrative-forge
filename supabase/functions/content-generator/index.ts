import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Article {
  id: string;
  title: string;
  body: string;
  author?: string;
  region?: string;
  category?: string;
  tags?: string[];
  summary?: string;
}

interface SlideContent {
  slideNumber: number;
  content: string;
  visualPrompt: string;
  altText: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasOpenAIKey: !!openAIApiKey
    });
    
    if (!supabaseUrl || !supabaseKey || !openAIApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { articleId } = await req.json();

    console.log('Processing article ID:', articleId);

    if (!articleId) {
      throw new Error('Article ID is required');
    }

    // Fetch the article
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (articleError) {
      console.error('Article fetch error:', articleError);
      throw new Error(`Article not found: ${articleError.message}`);
    }
    
    if (!article) {
      throw new Error('Article not found');
    }

    console.log('Found article:', article.title);

    // Create story record
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .insert({
        article_id: articleId,
        title: article.title,
        status: 'draft'
      })
      .select()
      .single();

    if (storyError) {
      console.error('Story creation error:', storyError);
      throw new Error(`Failed to create story: ${storyError.message}`);
    }
    
    if (!story) {
      throw new Error('Failed to create story');
    }

    console.log('Created story:', story.id);

    // Generate slides using OpenAI
    console.log('Generating slides with OpenAI...');
    const slides = await generateSlides(article, openAIApiKey);
    console.log('Generated slides:', slides.length);

    // Save slides to database
    const slideInserts = slides.map(slide => ({
      story_id: story.id,
      slide_number: slide.slideNumber,
      content: slide.content,
      visual_prompt: slide.visualPrompt,
      alt_text: slide.altText
    }));

    console.log('Inserting slides:', slideInserts.length);
    const { error: slidesError } = await supabase
      .from('slides')
      .insert(slideInserts);

    if (slidesError) {
      console.error('Slides insertion error:', slidesError);
      throw new Error(`Failed to save slides: ${slidesError.message}`);
    }

    // Update story status
    console.log('Updating story status to published...');
    const { error: updateError } = await supabase
      .from('stories')
      .update({ 
        status: 'published'
      })
      .eq('id', story.id);

    if (updateError) {
      console.error('Failed to update story status:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        storyId: story.id,
        slideCount: slides.length,
        slides: slides
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in content-generator function:', error);
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

async function generateSlides(article: Article, openAIApiKey: string): Promise<SlideContent[]> {
  const systemPrompt = `You are an expert social media content creator specializing in transforming news articles into engaging Instagram carousel slides.

REQUIREMENTS:
- Create exactly 5-7 slides from the article
- Slide 1 (Hook): ≤15 words - Create curiosity gap, don't reveal the full story
- Slides 2-3: ≤25 words each - Build context and tension
- Slides 4-6: ≤35 words each - Deliver key information and insights  
- Final slide: ≤40 words - Strong takeaway or call-to-action

STYLE GUIDELINES:
- Use active voice and strong verbs
- Create emotional connection with local relevance
- Include specific details and numbers when available
- End with clear takeaway or actionable insight
- Maintain trustworthy, editorial tone
- Each slide should work standalone but flow together

For each slide, also provide:
1. Visual prompt for AI image generation (descriptive, editorial style)
2. Alt text for accessibility

Return ONLY valid JSON with this structure:
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "Hook content here",
      "visualPrompt": "Editorial style image showing...",
      "altText": "Description for screen readers"
    }
  ]
}`;

  const userPrompt = `Transform this article into engaging carousel slides:

TITLE: ${article.title}
AUTHOR: ${article.author || 'Unknown'}
REGION: ${article.region || 'Unknown'}
CATEGORY: ${article.category || 'News'}

CONTENT:
${article.body}

Create slides that capture the essence of this story while being engaging for social media.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 2000,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API error:', errorData);
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    const parsed = JSON.parse(content);
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      throw new Error('Invalid response format from OpenAI');
    }
    return parsed.slides;
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content);
    throw new Error('Failed to parse AI response');
  }
}