import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Article {
  id: string;
  title: string;
  body: string;
  author?: string;
  published_at?: string;
  source_url: string;
  image_url?: string;
  canonical_url?: string;
  word_count: number;
  regional_relevance_score: number;
  content_quality_score: number;
  processing_status: string;
  import_metadata: Record<string, any>;
  topic_id?: string;
}

interface SlideContent {
  slideNumber: number;
  content: string;
  visualPrompt?: string;
  altText: string;
}

interface PromptTemplate {
  id: string;
  template_name: string;
  category: string;
  tone_type?: string;
  audience_expertise?: string;
  slide_type?: string;
  prompt_content: string;
  variables: Record<string, any>;
  is_active: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
  const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY')!;

  console.log('Environment check:', {
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseKey: !!supabaseKey,
    hasOpenAIKey: !!openaiApiKey,
    hasDeepSeekKey: !!deepseekApiKey,
  });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Enhanced Prompt System Builder
  async function buildPromptSystem(supabase: any, tone: string, expertise: string, slideType: string) {
    const { data: templates, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('is_active', true)
      .or(`tone_type.eq.${tone},tone_type.is.null`)
      .or(`audience_expertise.eq.${expertise},audience_expertise.is.null`)
      .or(`slide_type.eq.${slideType},slide_type.is.null`)
      .order('category', { ascending: true });

    if (error) {
      console.error('Error fetching prompt templates:', error);
      return null;
    }

    const systemPrompts = templates?.filter(t => t.category === 'system') || [];
    const contentPrompts = templates?.filter(t => t.category === 'content') || [];

    return {
      systemPrompts,
      contentPrompts,
      tone,
      expertise,
      slideType
    };
  }

  // Generate slides using DeepSeek
  async function generateSlidesWithDeepSeek(
    article: Article, 
    apiKey: string, 
    tone: string, 
    expertise: string, 
    slideType: string,
    publicationName: string
  ): Promise<SlideContent[]> {
    try {
      const prompt = `Create engaging Instagram carousel slides for this ${slideType} story.

ARTICLE DETAILS:
Title: ${article.title}
Content: ${article.body}
Publication: ${publicationName}
Author: ${article.author || 'Staff Reporter'}

REQUIREMENTS:
- Tone: ${tone}
- Audience expertise: ${expertise}
- Create exactly 5-7 slides
- Each slide should be concise but informative
- Include visual prompts for each slide
- Make it shareable and engaging
- Include alt text for accessibility

OUTPUT FORMAT (JSON):
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "Main headline and key point",
      "visualPrompt": "Description for visual/image",
      "altText": "Accessibility description"
    }
  ]
}`;

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are an expert content creator specializing in ${slideType} Instagram carousels. Create engaging, ${tone} content appropriate for ${expertise} audiences.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Enhanced JSON parsing with multiple attempts
      let slides;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          slides = parsed.slides || parsed;
        }
      } catch (error) {
        console.log('Initial JSON parsing failed, trying alternative methods...');
        
        // Try extracting just the slides array
        const slidesMatch = content.match(/\[[\s\S]*\]/);
        if (slidesMatch) {
          try {
            slides = JSON.parse(slidesMatch[0]);
          } catch (error) {
            console.log('Array parsing also failed, using fallback...');
            // Final fallback - create basic slides from content
            throw new Error('Could not parse JSON from DeepSeek response after multiple attempts');
          }
        }
      }
      
      if (!slides) {
        console.error('Failed to extract slides from DeepSeek response:', content);
        throw new Error('Could not parse JSON from DeepSeek response');
      }
      
      // Validate and normalize slide structure
      return slides.map((slide: any, index: number) => ({
        slideNumber: slide.slideNumber || (index + 1),
        content: slide.content || slide.text || `Generated slide ${index + 1}`,
        visualPrompt: slide.visualPrompt || slide.visual || slide.imagePrompt || `Visual representation for "${article.title}" - slide ${index + 1}`,
        altText: slide.altText || slide.alt || slide.description || `Slide ${index + 1}: ${(slide.content || '').substring(0, 50)}...`
      }));
      
    } catch (error) {
      console.error('Error generating slides with DeepSeek:', error);
      throw error;
    }
  }

  // Generate slides using OpenAI
  async function generateSlidesWithOpenAI(
    article: Article, 
    apiKey: string, 
    tone: string, 
    expertise: string, 
    slideType: string,
    publicationName: string
  ): Promise<SlideContent[]> {
    try {
      const prompt = `Create engaging Instagram carousel slides for this ${slideType} story.

ARTICLE DETAILS:
Title: ${article.title}
Content: ${article.body}
Publication: ${publicationName}
Author: ${article.author || 'Staff Reporter'}

REQUIREMENTS:
- Tone: ${tone}
- Audience expertise: ${expertise}
- Create exactly 5-7 slides
- Each slide should be concise but informative
- Include visual prompts for each slide
- Make it shareable and engaging
- Include alt text for accessibility

OUTPUT FORMAT (JSON):
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "Main headline and key point",
      "visualPrompt": "Description for visual/image",
      "altText": "Accessibility description"
    }
  ]
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert content creator specializing in ${slideType} Instagram carousels. Create engaging, ${tone} content appropriate for ${expertise} audiences.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Enhanced JSON parsing with multiple attempts
      let slides;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          slides = parsed.slides || parsed;
        }
      } catch (error) {
        console.log('Initial JSON parsing failed, trying alternative methods...');
        
        // Try extracting just the slides array
        const slidesMatch = content.match(/\[[\s\S]*\]/);
        if (slidesMatch) {
          try {
            slides = JSON.parse(slidesMatch[0]);
          } catch (error) {
            console.log('Array parsing also failed, using fallback...');
            // Final fallback - create basic slides from content
            throw new Error('Could not parse JSON from OpenAI response after multiple attempts');
          }
        }
      }
      
      if (!slides) {
        console.error('Failed to extract slides from OpenAI response:', content);
        throw new Error('Could not parse JSON from OpenAI response');
      }
      
      // Validate and normalize slide structure with enhanced error handling
      return slides.map((slide: any, index: number) => ({
        slideNumber: slide.slideNumber || (index + 1),
        content: slide.content || slide.text || `Generated slide ${index + 1}`,
        visualPrompt: slide.visualPrompt || slide.visual || slide.imagePrompt || `Visual representation for "${article.title}" - slide ${index + 1}`,
        altText: slide.altText || slide.alt || slide.description || `Slide ${index + 1}: ${(slide.content || '').substring(0, 50)}...`
      }));
      
    } catch (error) {
      console.error('Error generating slides with OpenAI:', error);
      throw error;
    }
  }

  async function generatePostCopyWithDeepSeek(
    article: Article, 
    slides: SlideContent[], 
    apiKey: string, 
    publicationName: string
  ): Promise<{ caption: string; hashtags: string[] }> {
    const prompt = `Create engaging Instagram post copy for this carousel about: ${article.title}

SLIDES PREVIEW:
${slides.map((slide, i) => `Slide ${i + 1}: ${slide.content.substring(0, 100)}...`).join('\n')}

Create:
1. An engaging caption (max 2200 characters)
2. Relevant hashtags (10-15 hashtags)

Make it engaging and shareable for ${publicationName}.

Return in JSON format:
{
  "caption": "Your engaging caption here...",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are a social media expert. Create engaging Instagram captions and hashtags.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          caption: `Check out this story about ${article.title}`,
          hashtags: ['news', 'update', 'story']
        };
      }
      
      const result = JSON.parse(jsonMatch[0]);
      return {
        caption: result.caption || `Check out this story about ${article.title}`,
        hashtags: result.hashtags || ['news', 'update', 'story']
      };
      
    } catch (error) {
      console.error('Error generating post copy with DeepSeek:', error);
      return {
        caption: `Check out this story about ${article.title}`,
        hashtags: ['news', 'update', 'story']
      };
    }
  }

  async function generatePostCopyWithOpenAI(
    article: Article, 
    slides: SlideContent[], 
    apiKey: string, 
    publicationName: string
  ): Promise<{ caption: string; hashtags: string[] }> {
    const prompt = `Create engaging Instagram post copy for this carousel about: ${article.title}

SLIDES PREVIEW:
${slides.map((slide, i) => `Slide ${i + 1}: ${slide.content.substring(0, 100)}...`).join('\n')}

Create:
1. An engaging caption (max 2200 characters) 
2. Relevant hashtags (10-15 hashtags)

Make it engaging and shareable for ${publicationName}.

Return in JSON format:
{
  "caption": "Your engaging caption here...",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a social media expert. Create engaging Instagram captions and hashtags.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          caption: `Check out this story about ${article.title}`,
          hashtags: ['news', 'update', 'story']
        };
      }
      
      const result = JSON.parse(jsonMatch[0]);
      return {
        caption: result.caption || `Check out this story about ${article.title}`,
        hashtags: result.hashtags || ['news', 'update', 'story']
      };
      
    } catch (error) {
      console.error('Error generating post copy with OpenAI:', error);
      return {
        caption: `Check out this story about ${article.title}`,
        hashtags: ['news', 'update', 'story']
      };
    }
  }

  try {
    const { 
      articleId, 
      slideType = 'tabloid', 
      aiProvider = 'deepseek',
      tone = 'conversational',
      audienceExpertise = 'intermediate'
    } = await req.json();
    
    console.log(`Processing article ID: ${articleId} with AI provider: ${aiProvider}, tone: ${tone}, expertise: ${audienceExpertise}`);

    // Get the article data
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (articleError || !article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    console.log(`Found article: ${article.title}`);

    // Get topic details for audience expertise and default tone if available
    let topicExpertise = audienceExpertise;
    let effectiveTone = tone;
    
    if (article.topic_id) {
      const { data: topicData } = await supabase
        .from('topics')
        .select('audience_expertise, default_tone')
        .eq('id', article.topic_id)
        .maybeSingle();
      
      if (topicData) {
        topicExpertise = topicData.audience_expertise || audienceExpertise;
        effectiveTone = topicData.default_tone || tone;
        console.log(`Using topic defaults: expertise=${topicExpertise}, tone=${effectiveTone}`);
      }
    }

    // Build enhanced prompt system
    const promptSystem = await buildPromptSystem(supabase, effectiveTone, topicExpertise, slideType);
    console.log(`Built prompt system with ${promptSystem?.systemPrompts?.length || 0} system prompts and ${promptSystem?.contentPrompts?.length || 0} content prompts`);
    
    // Determine publication name
    let publicationName = 'News Update';
    if (article.topic_id) {
      const { data: topicData } = await supabase
        .from('topics')
        .select('name')
        .eq('id', article.topic_id)
        .maybeSingle();
      
      if (topicData?.name) {
        publicationName = topicData.name;
      }
    }

    // Generate slides with the selected AI provider
    let slides: SlideContent[];
    let actualProvider = aiProvider;

    try {
      if (aiProvider === 'deepseek' && deepseekApiKey) {
        console.log('🤖 Using DeepSeek for slide generation...');
        slides = await generateSlidesWithDeepSeek(article, deepseekApiKey, effectiveTone, topicExpertise, slideType, publicationName);
      } else if (aiProvider === 'openai' && openaiApiKey) {
        console.log('🤖 Using OpenAI for slide generation...');
        slides = await generateSlidesWithOpenAI(article, openaiApiKey, effectiveTone, topicExpertise, slideType, publicationName);
      } else {
        // Fallback logic
        console.log('🔄 Primary provider not available, trying fallback...');
        if (openaiApiKey) {
          console.log('📝 Falling back to OpenAI...');
          slides = await generateSlidesWithOpenAI(article, openaiApiKey, effectiveTone, topicExpertise, slideType, publicationName);
          actualProvider = 'openai';
        } else if (deepseekApiKey) {
          console.log('📝 Falling back to DeepSeek...');
          slides = await generateSlidesWithDeepSeek(article, deepseekApiKey, effectiveTone, topicExpertise, slideType, publicationName);
          actualProvider = 'deepseek';
        } else {
          throw new Error('No AI provider available - both OpenAI and DeepSeek API keys missing');
        }
      }

      console.log(`✅ Generated ${slides.length} slides successfully`);
    } catch (error) {
      console.error('❌ Error during slide generation:', error);
      throw error;
    }

    // Generate post copy using appropriate provider
    let postCopy: { caption: string; hashtags: string[] };
    
    try {
      if (actualProvider === 'deepseek' && deepseekApiKey) {
        console.log('📱 Generating post copy with DeepSeek...');
        postCopy = await generatePostCopyWithDeepSeek(article, slides, deepseekApiKey, publicationName);
      } else if (openaiApiKey) {
        console.log('📱 Generating post copy with OpenAI...');
        postCopy = await generatePostCopyWithOpenAI(article, slides, openaiApiKey, publicationName);
      } else {
        console.log('📱 Using fallback post copy...');
        postCopy = {
          caption: `Check out this story about ${article.title}`,
          hashtags: ['news', 'update', 'story']
        };
      }
      
      console.log(`✅ Generated post copy: ${postCopy.caption.length} characters, ${postCopy.hashtags.length} hashtags`);
    } catch (error) {
      console.error('❌ Error generating post copy:', error);
      postCopy = {
        caption: `Check out this story about ${article.title}`,
        hashtags: ['news', 'update', 'story']
      };
    }

    // Store or update the story idempotently
    let storyId: string | null = null;

    // Try to find existing story for this article
    const { data: existingStory, error: existingStoryError } = await supabase
      .from('stories')
      .select('id,status')
      .eq('article_id', articleId)
      .maybeSingle();

    if (existingStoryError) {
      console.warn('⚠️ Error checking existing story, proceeding to create new:', existingStoryError);
    }

    if (existingStory?.id) {
      storyId = existingStory.id;
      // Optionally update title/status metadata
      const { error: updateStoryError } = await supabase
        .from('stories')
        .update({ title: article.title, updated_at: new Date().toISOString() })
        .eq('id', storyId);
      if (updateStoryError) {
        console.warn('⚠️ Failed to update existing story metadata:', updateStoryError);
      } else {
        console.log(`📝 Updated existing story ${storyId}`);
      }
    } else {
      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          article_id: articleId,
          title: article.title,
          status: 'draft'
        })
        .select('id')
        .single();

      if (storyError || !newStory) {
        throw new Error(`Failed to create story: ${storyError?.message || 'unknown error'}`);
      }
      storyId = newStory.id;
      console.log(`📖 Created story with ID: ${storyId}`);
    }

    // Replace slides atomically (delete then insert)
    const { error: deleteSlidesError } = await supabase
      .from('slides')
      .delete()
      .eq('story_id', storyId);
    if (deleteSlidesError) {
      console.warn('⚠️ Could not delete existing slides (may be none):', deleteSlidesError);
    }

    const { error: slidesError } = await supabase
      .from('slides')
      .insert(slides.map(slide => ({
        story_id: storyId,
        slide_number: slide.slideNumber,
        content: slide.content,
        visual_prompt: slide.visualPrompt,
        alt_text: slide.altText
      })));

    if (slidesError) {
      console.error('❌ Failed to store slides:', slidesError);
    } else {
      console.log('💾 Stored slides successfully');
    }

    // Upsert post copy for Instagram by replacing any prior row
    const { error: deletePostCopyError } = await supabase
      .from('story_social_content')
      .delete()
      .eq('story_id', storyId)
      .eq('platform', 'instagram');
    if (deletePostCopyError) {
      console.warn('⚠️ Could not delete existing social content (may be none):', deletePostCopyError);
    }

    const { error: postCopyError } = await supabase
      .from('story_social_content')
      .insert({
        story_id: storyId,
        platform: 'instagram',
        content_type: 'carousel_post',
        caption: postCopy.caption,
        hashtags: postCopy.hashtags,
        metadata: {
          ai_provider: actualProvider,
          tone_used: effectiveTone,
          expertise_level: topicExpertise,
          publication_name: publicationName
        }
      });

    if (postCopyError) {
      console.error('❌ Failed to store post copy:', postCopyError);
    } else {
      console.log('📱 Stored post copy successfully');
    }

    // Trigger carousel image generation (non-blocking)
    try {
      const { error: carouselError } = await supabase.functions.invoke('story-illustrator', {
        body: { 
          storyId,
          forceRegenerate: true,
          skipExistingImages: false
        }
      });
      
      if (carouselError) {
        console.error('❌ Failed to trigger carousel generation:', carouselError);
      } else {
        console.log('🎨 Triggered carousel image generation successfully');
      }
    } catch (carouselError) {
      console.error('❌ Error triggering carousel generation:', carouselError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        story_id: storyId,
        slides_count: slides.length,
        ai_provider: actualProvider,
        publication_name: publicationName,
        tone_used: effectiveTone,
        expertise_level: topicExpertise,
        enhanced_prompting: true,
        post_copy: postCopy
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.log(`❌ Error during enhanced slide generation: ${error.message}`);
    console.log('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});