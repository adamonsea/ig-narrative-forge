import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
        // Use provided tone, fallback to topic default, then system default
        effectiveTone = tone || topicData.default_tone || 'conversational';
        console.log(`🎯 Using topic settings - expertise: ${topicExpertise}, tone: ${effectiveTone}`);
      }
    }

    // Get topic CTA configuration if article has a topic
    let ctaConfig = null;
    if (article.topic_id) {
      const { data: ctaData } = await supabase
        .from('feed_cta_configs')
        .select('*')
        .eq('topic_id', article.topic_id)
        .eq('is_active', true)
        .maybeSingle();
      
      ctaConfig = ctaData;
      console.log(`🎯 Found CTA config for topic: ${ctaConfig ? 'Yes' : 'No'}`);
    }

    // Fetch prompt templates for enhanced generation
    const promptSystem = await buildPromptSystem(supabase, effectiveTone, topicExpertise, slideType);
    console.log(`🎨 Built prompt system with ${Object.keys(promptSystem).length} components`);

    // Extract publication name with validation
    const publicationName = extractPublicationName(article.source_url);
    console.log(`🔍 Extracting publication from URL: ${article.source_url}`);

    // Log source attribution in separate table
    try {
      await supabase.from('source_attributions').insert({
        article_id: articleId,
        source_url: article.source_url,
        detected_domain: new URL(article.source_url).hostname,
        extracted_publication: publicationName,
        validation_status: 'pending'
      });
      console.log(`📝 Logged source attribution for article ${articleId}`);
    } catch (attributionError) {
      console.error('Failed to log source attribution:', attributionError);
    }

    // Start enhanced slide generation
    console.log(`🤖 Starting enhanced slide generation for article: ${article.title}`);
    
    // Extract hook promises for validation
    const hookPromises = extractHookPromises(article.title);
    console.log(`🎯 Extracted hook promises from headline: ${JSON.stringify(hookPromises)}`);

    // Initialize variables with safe defaults to prevent ReferenceError
    let slides: SlideContent[] = [];
    let postCopy: { caption: string; hashtags: string[] } = { caption: '', hashtags: [] };
    const actualProvider = aiProvider || 'openai';

    console.log(`🎯 Generating slides using ${actualProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI'} with slideType: ${slideType}, tone: ${effectiveTone}, expertise: ${topicExpertise}`);

    try {
      // Generate slides using enhanced prompt system
      if (actualProvider === 'deepseek' && deepseekApiKey) {
        console.log('🔄 Generating slides with enhanced DeepSeek prompting...');
        slides = await generateSlidesWithEnhancedPrompts(article, slideType, deepseekApiKey, publicationName, supabase, ctaConfig, promptSystem, 'deepseek');
        console.log(`✅ Generated ${slides.length} slides with enhanced DeepSeek`);
        
        console.log('🔄 Generating post copy with DeepSeek...');
        postCopy = await generatePostCopyWithDeepSeek(article, slides, deepseekApiKey, publicationName);
        console.log('✅ Generated post copy with DeepSeek');
      } else {
        console.log('🔄 Generating slides with enhanced OpenAI prompting...');
        slides = await generateSlidesWithEnhancedPrompts(article, slideType, openaiApiKey, publicationName, supabase, ctaConfig, promptSystem, 'openai');
        console.log(`✅ Generated ${slides.length} slides with enhanced OpenAI`);
        
        console.log('🔄 Generating post copy with OpenAI...');
        postCopy = await generatePostCopy(article, slides, openaiApiKey, publicationName);
        console.log('✅ Generated post copy with OpenAI');
      }

      // Validate that we have slides and post copy
      if (!slides || slides.length === 0) {
        throw new Error('No slides were generated');
      }
      if (!postCopy || !postCopy.caption) {
        throw new Error('No post copy was generated');
      }
    } catch (error) {
      console.error('❌ Error during enhanced content generation:', error);
      throw new Error(`Enhanced content generation failed: ${error.message}`);
    }

    console.log(`✅ Generated ${slides.length} slides and post copy successfully with enhanced prompting`);
    
    // Validate promise delivery
    const promiseDeliveryValid = validatePromiseDelivery(slides, hookPromises);
    if (!promiseDeliveryValid) {
      console.log('⚠️ Warning: Generated content may not fully deliver on headline promises');
    }

    // Create or update the story
    let story;
    const { data: existingStory, error: storyCheckError } = await supabase
      .from('stories')
      .select('id, status')
      .eq('article_id', articleId)
      .single();

    if (existingStory) {
      console.log(`Using existing story: ${existingStory.id}`);
      story = existingStory;
      
      // Update status to processing to prevent race conditions
      const { error: statusUpdateError } = await supabase
        .from('stories')
        .update({ status: 'processing' })
        .eq('id', existingStory.id);

      if (statusUpdateError) {
        console.error('Error updating story status:', statusUpdateError);
      }
    } else {
      console.log('Creating new story...');
      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          title: article.title,
          article_id: articleId,
          status: 'processing'
        })
        .select()
        .single();

      if (storyError || !newStory) {
        throw new Error(`Failed to create story: ${storyError?.message}`);
      }
      
      story = newStory;
      console.log(`✅ Created story: ${story.id}`);
    }

    // Delete existing slides and posts for this story to avoid duplicates
    console.log('Cleaning up existing slides and posts...');
    const { error: deleteSlideError } = await supabase
      .from('slides')
      .delete()
      .eq('story_id', story.id);

    if (deleteSlideError) {
      console.error('Error deleting existing slides:', deleteSlideError);
    }

    const { error: deletePostError } = await supabase
      .from('posts')
      .delete()
      .eq('story_id', story.id);

    if (deletePostError) {
      console.error('Error deleting existing posts:', deletePostError);
    }

    // Verify story still exists before inserting slides (handles race conditions)
    const { data: storyCheck, error: storyVerifyError } = await supabase
      .from('stories')
      .select('id')
      .eq('id', story.id)
      .single();

    if (storyVerifyError || !storyCheck) {
      console.error('Story was deleted during generation - likely by another process');
      throw new Error('Story was deleted during generation process');
    }

    // Insert the new slides
    console.log(`Inserting slides: ${slides.length}`);
    const { error: insertError } = await supabase
      .from('slides')
      .insert(
        slides.map(slide => ({
          story_id: story.id,
          slide_number: slide.slideNumber,
          content: slide.content,
          visual_prompt: slide.visualPrompt || `Create an engaging visual for: ${slide.content}`,
          alt_text: slide.altText,
          word_count: slide.content.split(' ').length
        }))
      );

    if (insertError) {
      console.error('Error inserting slides:', insertError);
      throw new Error(`Failed to insert slides: ${insertError.message}`);
    }

    // Update the story with publication info, source attribution and AI provider
    const sourceAttribution = article.author 
      ? `Summarised from an article in ${publicationName}, by ${article.author}`
      : `Summarised from an article in ${publicationName}`;

    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({ 
        status: 'ready',
        is_published: true,
        publication_name: publicationName,
        author: article.author
      })
      .eq('id', story.id);

    if (storyUpdateError) {
      console.error('Error updating story:', storyUpdateError);
      throw new Error(`Failed to update story: ${storyUpdateError.message}`);
    }

    // Update article processing status to processed
    const { error: articleUpdateError } = await supabase
      .from('articles')
      .update({ 
        processing_status: 'processed',
        updated_at: new Date().toISOString()
      })
      .eq('id', articleId);

    if (articleUpdateError) {
      console.error('Error updating article status:', articleUpdateError);
      throw new Error(`Failed to update article status: ${articleUpdateError.message}`);
    }

    // Insert post copy for social media
    const { error: postError } = await supabase
      .from('posts')
      .insert({
        story_id: story.id,
        platform: 'instagram',
        caption: postCopy.caption,
        hashtags: postCopy.hashtags,
        source_attribution: sourceAttribution,
        status: 'draft'
      });

    if (postError) {
      console.error('Error inserting post:', postError);
    }

    // Mark queue job as completed
    const { error: queueUpdateError } = await supabase
      .from('content_generation_queue')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_data: { 
          story_id: story.id,
          slides_count: slides.length,
          ai_provider: actualProvider,
          tone_used: effectiveTone,
          expertise_level: topicExpertise
        }
      })
      .eq('article_id', articleId);

    if (queueUpdateError) {
      console.error('Error updating queue status:', queueUpdateError);
    }

    // Log API usage
    await supabase.from('api_usage').insert({
      service_name: actualProvider === 'deepseek' ? 'deepseek' : 'openai',
      operation: 'enhanced_slide_generation',
      tokens_used: estimateTokenUsage(article.body + slides.map(s => s.content).join(' ')),
      cost_usd: 0.01 // Approximate cost
    });

    console.log(`✅ Enhanced content generation completed successfully for story: ${story.id}`);

    // Trigger carousel image generation
    try {
      const { error: carouselError } = await supabase.functions.invoke('generate-carousel-images', {
        body: { storyId: story.id }
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
        story_id: story.id,
        slides_count: slides.length,
        ai_provider: actualProvider,
        publication_name: publicationName,
        tone_used: effectiveTone,
        expertise_level: topicExpertise,
        enhanced_prompting: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
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

// Enhanced Prompt System Builder
async function buildPromptSystem(supabase: any, tone: string, expertise: string, slideType: string) {
  const { data: templates, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching prompt templates:', error);
    return getDefaultPromptSystem(tone, expertise, slideType);
  }

  const promptSystem: Record<string, string> = {};

  templates.forEach((template: PromptTemplate) => {
    if (template.category === 'base') {
      promptSystem.base = template.prompt_content;
    } else if (template.category === 'tone' && template.tone_type === tone) {
      promptSystem.tone = template.prompt_content;
    } else if (template.category === 'expertise' && template.audience_expertise === expertise) {
      promptSystem.expertise = template.prompt_content;
    } else if (template.category === 'slideType' && template.slide_type === slideType) {
      promptSystem.slideType = template.prompt_content;
    }
  });

  // Fallback to defaults if any component is missing
  if (!promptSystem.base) promptSystem.base = getDefaultPromptSystem(tone, expertise, slideType).base;
  if (!promptSystem.tone) promptSystem.tone = getDefaultPromptSystem(tone, expertise, slideType).tone;
  if (!promptSystem.expertise) promptSystem.expertise = getDefaultPromptSystem(tone, expertise, slideType).expertise;
  if (!promptSystem.slideType) promptSystem.slideType = getDefaultPromptSystem(tone, expertise, slideType).slideType;

  return promptSystem;
}

// Default prompt system fallback
function getDefaultPromptSystem(tone: string, expertise: string, slideType: string) {
  const tonePrompts = {
    formal: 'Write with authority and precision. Use clear, direct language. Maintain credibility through factual accuracy.',
    conversational: 'Explain like you would to a friend. Use accessible language and relate to everyday experiences.',
    engaging: 'Create compelling, interesting content that hooks readers while staying truthful and informative.'
  };

  const expertisePrompts = {
    beginner: 'Explain concepts clearly with sufficient context. Define technical terms when first mentioned. Use analogies where helpful. Focus on broader implications rather than technical details.',
    intermediate: 'Balance technical accuracy with accessibility. Briefly explain specialized terms. Assume basic familiarity with the subject matter.',
    expert: 'Use industry terminology and technical depth. Focus on nuanced implications and sophisticated analysis. Assume advanced subject matter knowledge.'
  };

  const slideTypePrompts = {
    short: 'Create concise, punchy content. Focus on key highlights and essential information. Optimize for quick consumption.',
    tabloid: 'Create balanced content with good detail. Include context and key supporting information. Standard comprehensive coverage.',
    indepth: 'Create detailed, thorough content. Include background context, implications, and comprehensive analysis.',
    extensive: 'Create comprehensive, detailed content with extensive analysis. Include multiple perspectives and thorough background information.'
  };

  const writingStylePrompts = {
    journalistic: 'Structure your content using traditional journalism principles: Lead with the most important information (who, what, when, where, why). Use inverted pyramid structure with key facts first. Include proper attribution and quotes where relevant.',
    educational: 'Create educational content that teaches and informs: Start with clear learning objectives. Use simple, accessible language with definitions. Include concrete examples to illustrate concepts.',
    listicle: 'Format content as an organized list structure: Use numbered or bulleted points for main ideas. Keep each point concise but complete. Make each point actionable or specific.',
    story_driven: 'Tell the story using narrative techniques: Begin with a compelling hook or scene. Introduce characters and establish setting. Build narrative tension with resolution.'
  };

  return {
    base: 'You are an expert content creator specializing in transforming news articles into engaging social media carousels. Your goal is to create compelling, accurate, and well-structured content that maintains journalistic integrity while being engaging for social media audiences.',
    tone: tonePrompts[tone as keyof typeof tonePrompts] || tonePrompts.conversational,
    expertise: expertisePrompts[expertise as keyof typeof expertisePrompts] || expertisePrompts.intermediate,
    slideType: slideTypePrompts[slideType as keyof typeof slideTypePrompts] || slideTypePrompts.tabloid,
    writingStyle: writingStylePrompts[writingStyle as keyof typeof writingStylePrompts] || writingStylePrompts.journalistic
  };
}

// Enhanced slide generation with modular prompts
async function generateSlidesWithEnhancedPrompts(
  article: Article,
  slideType: string,
  apiKey: string,
  publicationName: string,
  supabase: any,
  ctaConfig: any,
  promptSystem: Record<string, string>,
  provider: 'openai' | 'deepseek'
): Promise<SlideContent[]> {
  
  const systemPrompt = buildEnhancedSystemPrompt(promptSystem, slideType, article, publicationName, ctaConfig);
  
  console.log(`🎨 Using enhanced ${provider} prompts with tone: ${promptSystem.tone ? 'custom' : 'default'}`);
  
  if (provider === 'deepseek') {
    return generateSlidesWithDeepSeek(article, slideType, apiKey, publicationName, supabase, ctaConfig, systemPrompt);
  } else {
    return generateSlidesWithOpenAI(article, slideType, apiKey, publicationName, supabase, ctaConfig, systemPrompt);
  }
}

function buildEnhancedSystemPrompt(
  promptSystem: Record<string, string>, 
  slideType: string, 
  article: Article, 
  publicationName: string, 
  ctaConfig: any
): string {
  
  const basePrompt = promptSystem.base;
  const toneGuidance = promptSystem.tone;
  const expertiseGuidance = promptSystem.expertise;
  const slideTypeGuidance = promptSystem.slideType;
  
  const expectedSlideCount = getExpectedSlideCount(slideType, article);
  
  return `${basePrompt}

TONE REQUIREMENTS:
${toneGuidance}

AUDIENCE EXPERTISE LEVEL:
${expertiseGuidance}

SLIDE TYPE GUIDANCE:
${slideTypeGuidance}

CONTENT REQUIREMENTS:
- Generate exactly ${expectedSlideCount} slides
- Each slide should be substantial and informative
- Maintain journalistic accuracy while being engaging
- Include proper attribution to "${publicationName}"
- Use clear, compelling headlines for each slide
- Ensure smooth narrative flow between slides

${ctaConfig ? `
TOPIC-SPECIFIC CTA:
- Include the following call-to-action where appropriate: "${ctaConfig.engagement_question || ''}"
- Attribution line: "${ctaConfig.attribution_cta || ''}"
- Show engagement prompts: ${ctaConfig.show_like_share ? 'Yes' : 'No'}
` : ''}

Please generate ${expectedSlideCount} slides that transform this news article into an engaging, informative social media carousel while adhering to all the above guidance.`;
}

// Helper functions
function getExpectedSlideCount(slideType: string, article?: Article): number {
  if (article) {
    const wordCount = article.word_count || 0;
    console.log(`📊 Content analysis: ${wordCount} words`);
    
    if (wordCount < 200) return 3;
    if (wordCount < 400) return 4; 
    if (wordCount < 600) return 5;
    if (wordCount < 800) return 6;
    if (wordCount < 1200) return 7;
    return 8;
  }
  
  switch (slideType) {
    case 'short': return 4;
    case 'tabloid': return 6;
    case 'indepth': return 8;
    case 'extensive': return 12;
    default: return 6;
  }
}

function estimateTokenUsage(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractHookPromises(headline: string): string[] {
  const promises: string[] = [];
  const promiseIndicators = [
    'secrecy', 'secret', 'secrets', 'hidden', 'revealed', 'exclusive',
    'rivalry', 'conflict', 'battle', 'clash', 'feud', 'tension',
    'shocking', 'scandal', 'controversial', 'unprecedented', 'dramatic',
    'mystery', 'unknown', 'behind closed doors', 'insider', 'exclusive'
  ];
  
  const lowerHeadline = headline.toLowerCase();
  promiseIndicators.forEach(indicator => {
    if (lowerHeadline.includes(indicator)) {
      promises.push(indicator);
    }
  });
  
  return promises;
}

function validatePromiseDelivery(slides: SlideContent[], promises: string[]): boolean {
  if (promises.length === 0) return true;
  
  const allSlideContent = slides.map(s => s.content.toLowerCase()).join(' ');
  
  const deliveredPromises = promises.filter(promise => 
    allSlideContent.includes(promise) || 
    allSlideContent.includes(promise.replace('y', 'ies')) ||
    allSlideContent.includes(promise.substring(0, promise.length - 1))
  );

  return deliveredPromises.length >= promises.length * 0.7;
}

function extractPublicationName(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase();
    
    // Publication mapping - generic major news sources only
    const publicationMap: { [key: string]: string } = {
      'bbc.co.uk': 'BBC',
      'bbc.com': 'BBC',
      'theguardian.com': 'The Guardian',
      'independent.co.uk': 'The Independent',
      'dailymail.co.uk': 'Daily Mail',
      'telegraph.co.uk': 'The Telegraph',
      'thetimes.co.uk': 'The Times',
      'mirror.co.uk': 'The Mirror',
      'express.co.uk': 'The Express',
      'metro.co.uk': 'Metro'
    };
    
    const matchedPublication = Object.keys(publicationMap).find(domain => hostname.includes(domain));
    if (matchedPublication) {
      return publicationMap[matchedPublication];
    }
    
    // Generic extraction
    const parts = hostname.replace('www.', '').split('.');
    if (parts.length >= 2) {
      const name = parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    
    return 'Unknown Publication';
  } catch (error) {
    console.error('Error extracting publication name:', error);
    return 'Unknown Publication';
  }
}

async function generateSlidesWithDeepSeek(
  article: Article, 
  slideType: string, 
  apiKey: string, 
  publicationName: string, 
  supabase: any, 
  ctaConfig: any, 
  systemPrompt?: string
): Promise<SlideContent[]> {
  const { DeepSeekPromptBuilder } = await import('../_shared/prompt-optimization.ts');
  const expectedSlideCount = getExpectedSlideCount(slideType, article);
  
  // Use optimized DeepSeek prompt structure
  const prompt = systemPrompt || new DeepSeekPromptBuilder()
    .context(`Transform this news article into ${expectedSlideCount} engaging carousel slides.\n\nARTICLE: "${article.title}"\n${article.body}\n\nSOURCE: ${publicationName}`)
    .addCriticalPoint(`Create exactly ${expectedSlideCount} slides - no more, no less`)
    .addCriticalPoint('Each slide must be substantial and informative (50-150 characters)')
    .addInstruction('Analyze the article structure and identify key information', [
      'Main story elements, facts, and developments',
      'Supporting details and important context',
      'Notable quotes, statistics, or data points',
      'Timeline or sequence of events if applicable'
    ])
    .addInstruction('Create engaging, conversational slide content', [
      'Use accessible language that engages social media audiences',
      'Make each slide informative yet digestible',
      'Maintain accuracy to source material - no speculation',
      'Include compelling hooks and transitions between slides'
    ])
    .addInstruction('Generate visual prompts and accessibility content', [
      'Create specific, actionable visual descriptions',
      'Ensure visual prompts match slide content theme',
      'Write descriptive alt text for screen reader accessibility',
      'Consider visual storytelling that complements the text'
    ])
    .outputFormat('Return as valid JSON array with exact structure', {
      type: 'array',
      items: {
        slideNumber: 'number (1, 2, 3...)',
        content: 'string (slide text content)',
        visualPrompt: 'string (description for image generation)',
        altText: 'string (accessibility description)'
      }
    })
    .build();

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 1.2, // Slightly reduced for better consistency
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API Error:', errorData);
      throw new Error(`DeepSeek API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Enhanced JSON parsing with better error handling
    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Try alternative parsing methods
      const lines = content.split('\n');
      const jsonLines = lines.filter(line => line.trim().startsWith('[') || line.includes('"slideNumber"'));
      if (jsonLines.length > 0) {
        jsonMatch = [jsonLines.join('\n')];
      }
    }
    
    if (!jsonMatch) {
      console.error('Failed to parse JSON from DeepSeek response:', content);
      throw new Error('Could not parse JSON from DeepSeek response');
    }
    
    const slides = JSON.parse(jsonMatch[0]);
    
    // Validate and normalize slide structure
    return slides.map((slide: any, index: number) => ({
      slideNumber: slide.slideNumber || (index + 1),
      content: slide.content || slide.text || `Slide ${index + 1} content`,
      visualPrompt: slide.visualPrompt || slide.visual || `Visual for ${article.title} - slide ${index + 1}`,
      altText: slide.altText || slide.alt || `Slide ${index + 1}: ${slide.content?.substring(0, 50) || 'Content'}...`
    }));
    
  } catch (error) {
    console.error('Error generating slides with DeepSeek:', error);
    throw error;
  }
}

async function generateSlidesWithOpenAI(
  article: Article, 
  slideType: string, 
  apiKey: string, 
  publicationName: string, 
  supabase: any, 
  ctaConfig: any, 
  systemPrompt?: string
): Promise<SlideContent[]> {
  const { OpenAIPromptBuilder } = await import('../_shared/prompt-optimization.ts');
  const expectedSlideCount = getExpectedSlideCount(slideType, article);
  
  // Use optimized XML-structured prompt for OpenAI
  const promptData = systemPrompt ? { system: 'You are an expert content creator specializing in social media carousel generation.', user: systemPrompt } :
    new OpenAIPromptBuilder()
      .context(`Article Title: ${article.title}\nArticle Content: ${article.body}\nPublication: ${publicationName}\nTarget Slide Count: ${expectedSlideCount}`)
      .instructions([
        `Create exactly ${expectedSlideCount} engaging carousel slides from the provided article`,
        'Transform news content into social media-optimized format',
        'Ensure each slide is substantial and informative (50-150 characters)',
        'Maintain journalistic accuracy while making content accessible',
        'Create compelling visual descriptions for each slide',
        'Include proper accessibility alt text for all visual elements'
      ])
      .constraints([
        'Stay strictly within the bounds of the source article content',
        'Do not add speculation or information not present in the original',
        'Each slide must be self-contained yet part of the larger narrative',
        'Visual prompts must be specific and actionable for image generation',
        'Alt text must be descriptive for screen reader accessibility'
      ])
      .outputFormat(
        {
          type: 'array',
          items: {
            slideNumber: { type: 'integer', description: 'Sequential slide number starting from 1' },
            content: { type: 'string', description: 'Main text content for the slide' },
            visualPrompt: { type: 'string', description: 'Detailed description for visual/image generation' },
            altText: { type: 'string', description: 'Accessibility text describing the slide content' }
          }
        },
        'Return a valid JSON array with the exact structure specified'
      )
      .buildWithSystem('You are an expert content creator specializing in transforming news articles into engaging, accessible social media carousels. Focus on clarity, accuracy, and visual storytelling.');

  try {

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14', // Use newer model for better performance
        messages: [
          {
            role: 'system',
            content: promptData.system
          },
          {
            role: 'user',
            content: promptData.user
          }
        ],
        max_completion_tokens: 4000, // Use max_completion_tokens for newer models
        // Note: temperature not supported in newer models
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API Error:', errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Enhanced JSON parsing with multiple fallback methods
    let slides = null;
    
    try {
      // Try direct JSON parse first
      if (content.trim().startsWith('[')) {
        slides = JSON.parse(content);
      } else {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          slides = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (parseError) {
      console.error('JSON parsing failed, attempting alternative extraction:', parseError);
      // Alternative extraction method for malformed JSON
      const lines = content.split('\n');
      const slideLines = lines.filter(line => line.includes('"slideNumber"') || line.includes('"content"'));
      if (slideLines.length > 0) {
        try {
          slides = JSON.parse('[' + slideLines.join(',') + ']');
        } catch {
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

Generate a compelling caption and relevant hashtags.

Format as JSON:
{
  "caption": "Your caption here",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
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

async function generatePostCopy(
  article: Article, 
  slides: SlideContent[], 
  apiKey: string, 
  publicationName: string
): Promise<{ caption: string; hashtags: string[] }> {
  const prompt = `Create engaging Instagram post copy for this carousel about: ${article.title}

Generate a compelling caption and relevant hashtags.

Format as JSON:
{
  "caption": "Your caption here",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
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
