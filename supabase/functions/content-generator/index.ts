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
    const { articleId, slideType = 'tabloid' } = await req.json();

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

    // Check if story already exists for this article
    let story;
    const { data: existingStory } = await supabase
      .from('stories')
      .select('*')
      .eq('article_id', articleId)
      .single();

    if (existingStory) {
      console.log('Story already exists for article:', articleId, 'Story ID:', existingStory.id);
      story = existingStory;
      
      // Update status to processing if it's not already published
      if (story.status !== 'published') {
        const { error: updateError } = await supabase
          .from('stories')
          .update({ status: 'processing' })
          .eq('id', story.id);
        
        if (updateError) {
          console.error('Failed to update story status:', updateError);
        }
      }
    } else {
      // Create new story record
      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          article_id: articleId,
          title: article.title,
          status: 'processing'
        })
        .select()
        .single();

      if (storyError) {
        console.error('Story creation error:', storyError);
        throw new Error(`Failed to create story: ${storyError.message}`);
      }
      
      story = newStory;
    }
    
    if (!story) {
      throw new Error('Failed to create story');
    }

    console.log('Created story:', story.id);

    console.log('🤖 Starting slide generation for article:', article.title);
    
    // Generate slides using OpenAI
    const slides = await generateSlides(article, openAIApiKey, slideType);

    if (!slides || slides.length === 0) {
      console.error('❌ No slides generated for article:', article.title);
      return new Response(JSON.stringify({ error: 'Failed to generate slides' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Generated', slides.length, 'slides for article:', article.title);

    // Delete existing slides if story already existed
    if (existingStory) {
      console.log('Deleting existing slides for story:', story.id);
      const { error: deleteError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', story.id);
      
      if (deleteError) {
        console.error('Failed to delete existing slides:', deleteError);
      }
    }

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

    // Update story status to draft for review
    console.log('Updating story status to draft for review...');
    const { error: updateError } = await supabase
      .from('stories')
      .update({ 
        status: 'draft'
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

async function generateSlides(article: Article, openAIApiKey: string, slideType: string = 'tabloid'): Promise<SlideContent[]> {
  const getSlidePrompt = (type: string) => {
    switch (type) {
      case 'short':
        return `You are an expert social media content creator specializing in transforming news articles into engaging Instagram carousel slides.

REQUIREMENTS:
- Create exactly 4 slides from the article
- Slide 1 (Hook): ≤15 words - Create curiosity gap, don't reveal the full story
- Slide 2: ≤25 words - Build context 
- Slide 3: ≤35 words - Deliver key information
- Slide 4: ≤40 words - Strong takeaway or call-to-action

STYLE: Quick news bites, punchy and direct. Focus on the most essential information only.`;

      case 'indepth':
        return `You are an expert social media content creator specializing in transforming news articles into engaging Instagram carousel slides.

REQUIREMENTS:
- Create exactly 10-12 slides from the article
- Slide 1 (Hook): ≤15 words - Create curiosity gap
- Slide 2 (Background): ≤25 words - Set context
- Slides 3-6: ≤30 words each - Key developments, details, quotes
- Slides 7-9: ≤35 words each - Analysis, implications, community impact
- Slide 10 (Future): ≤35 words - What happens next
- Final slide: ≤40 words - Strong conclusion with call-to-action

STYLE: Comprehensive coverage with deep analysis. Include multiple perspectives, data points, and expert insights.`;

      default: // tabloid
        return `You are an expert social media content creator specializing in transforming news articles into engaging Instagram carousel slides.

REQUIREMENTS:
- Create exactly 8 slides from the article
- Slide 1 (Hook): ≤15 words - Create curiosity gap, don't reveal the full story
- Slide 2 (Context): ≤20 words - Set the scene
- Slides 3-5: ≤30 words each - Build tension and deliver key developments
- Slides 6-7: ≤35 words each - Impact and implications
- Final slide: ≤40 words - Strong takeaway or call-to-action

STYLE: Detailed storytelling with dramatic tension. Focus on human interest and emotional impact.`;
    }
  };

  const systemPrompt = `${getSlidePrompt(slideType)}

UNIVERSAL GUIDELINES:
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
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API error:', errorData);
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  console.log('OpenAI API response data:', JSON.stringify(data, null, 2));
  
  const content = data.choices[0].message.content;
  console.log('OpenAI content to parse:', content);
  
  try {
    const parsed = JSON.parse(content);
    console.log('Parsed OpenAI response:', parsed);
    
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      console.error('Invalid response structure:', parsed);
      throw new Error(`Invalid response format from OpenAI. Expected 'slides' array, got: ${typeof parsed.slides}`);
    }
    
    if (parsed.slides.length === 0) {
      throw new Error('OpenAI returned empty slides array');
    }
    
    // Validate slide structure
    for (let i = 0; i < parsed.slides.length; i++) {
      const slide = parsed.slides[i];
      if (!slide.slideNumber || !slide.content || !slide.visualPrompt || !slide.altText) {
        console.error(`Invalid slide ${i}:`, slide);
        throw new Error(`Slide ${i} missing required properties`);
      }
    }
    
    return parsed.slides;
  } catch (parseError) {
    console.error('JSON Parse error:', parseError);
    console.error('Raw OpenAI response content:', content);
    throw new Error(`Failed to parse AI response: ${parseError.message}`);
  }
}