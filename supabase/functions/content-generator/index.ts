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
}

interface SlideContent {
  slideNumber: number;
  content: string;
  visualPrompt?: string;
  altText: string;
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
    useDeepSeek: Deno.env.get('USE_DEEPSEEK') === 'true'
  });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { articleId, slideType = 'tabloid', aiProvider = 'deepseek', tone = 'conversational', audienceExpertise = 'intermediate' } = await req.json();
    
    console.log(`Processing article ID: ${articleId} with AI provider: ${aiProvider}, tone: ${tone}, expertise: ${audienceExpertise}`);

    // Get prompt templates for the current tone and expertise
    const { data: promptTemplates, error: promptError } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('is_active', true)
      .in('category', ['base', 'tone', 'expertise', 'slideType']);

    if (promptError) {
      console.warn('Failed to load prompt templates, using defaults:', promptError);
    }

    // Build enhanced prompts using template system
    const getPromptByCategory = (category: string, specificType?: string) => {
      if (!promptTemplates) return '';
      
      if (category === 'tone') {
        return promptTemplates.find(t => t.category === 'tone' && t.tone_type === tone)?.prompt_content || '';
      }
      if (category === 'expertise') {
        return promptTemplates.find(t => t.category === 'expertise' && t.audience_expertise === audienceExpertise)?.prompt_content || '';
      }
      if (category === 'slideType') {
        return promptTemplates.find(t => t.category === 'slideType' && t.slide_type === slideType)?.prompt_content || '';
      }
      return promptTemplates.find(t => t.category === category)?.prompt_content || '';
    };

    const basePrompt = getPromptByCategory('base');
    const tonePrompt = getPromptByCategory('tone');
    const expertisePrompt = getPromptByCategory('expertise');
    const slideTypePrompt = getPromptByCategory('slideType');

    console.log(`🎯 Using enhanced prompting: Base: ${!!basePrompt}, Tone: ${tone}, Expertise: ${audienceExpertise}, SlideType: ${slideType}`);

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

    // Start slide generation
    console.log(`🤖 Starting slide generation for article: ${article.title}`);
    
    // Extract hook promises for validation
    const hookPromises = extractHookPromises(article.title);
    console.log(`🎯 Extracted hook promises from headline: ${JSON.stringify(hookPromises)}`);

    // Validate the final publication name
    const finalPublicationName = publicationName;
    console.log(`📰 Final publication name: ${finalPublicationName}`);

    // Initialize variables with safe defaults to prevent ReferenceError
    let slides: SlideContent[] = [];
    let postCopy: { caption: string; hashtags: string[] } = { caption: '', hashtags: [] };
    const actualProvider = aiProvider || 'openai';

    console.log(`🎯 Generating slides using ${actualProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI'} with slideType: ${slideType}, expected count: ${getExpectedSlideCount(slideType, article)}`);

    try {
      // Generate slides first, then post copy (slides must be available for post copy generation)
      if (actualProvider === 'deepseek' && deepseekApiKey) {
        console.log('🔄 Generating slides with DeepSeek...');
        slides = await generateSlidesWithDeepSeek(
          article, slideType, deepseekApiKey, finalPublicationName, supabase, ctaConfig,
          basePrompt, tonePrompt, expertisePrompt, slideTypePrompt
        );
        console.log(`✅ Generated ${slides.length} slides with DeepSeek`);
        
        console.log('🔄 Generating post copy with DeepSeek...');
        postCopy = await generatePostCopyWithDeepSeek(
          article, slides, deepseekApiKey, finalPublicationName,
          basePrompt, tonePrompt, expertisePrompt
        );
        console.log('✅ Generated post copy with DeepSeek');
      } else {
        console.log('🔄 Generating slides with OpenAI...');
        slides = await generateSlides(
          article, slideType, openaiApiKey, finalPublicationName, supabase, ctaConfig,
          basePrompt, tonePrompt, expertisePrompt, slideTypePrompt
        );
        console.log(`✅ Generated ${slides.length} slides with OpenAI`);
        
        console.log('🔄 Generating post copy with OpenAI...');
        postCopy = await generatePostCopy(
          article, slides, openaiApiKey, finalPublicationName,
          basePrompt, tonePrompt, expertisePrompt
        );
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
      console.error('❌ Error during content generation:', error);
      throw new Error(`Content generation failed: ${error.message}`);
    }

    console.log(`✅ Generated ${slides.length} slides and post copy successfully`);

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
      ? `Summarised from an article in ${finalPublicationName}, by ${article.author}`
      : `Summarised from an article in ${finalPublicationName}`;

    const { error: storyUpdateError } = await supabase
      .from('stories')
      .update({ 
        status: 'ready',
        is_published: true,
        publication_name: finalPublicationName,
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
          ai_provider: actualProvider
        }
      })
      .eq('article_id', articleId);

    if (queueUpdateError) {
      console.error('Error updating queue status:', queueUpdateError);
    }

    // Log API usage
    await supabase.from('api_usage').insert({
      service_name: actualProvider === 'deepseek' ? 'deepseek' : 'openai',
      operation: 'slide_generation',
      tokens_used: estimateTokenUsage(article.body + slides.map(s => s.content).join(' ')),
      cost_usd: 0.01 // Approximate cost
    });

    console.log(`✅ Content generation completed successfully for story: ${story.id}`);

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
        publication_name: finalPublicationName
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.log(`❌ Error during slide generation: ${error.message}`);
    console.log('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    console.log(`❌ ERROR in content-generator function: ${error.message}`);
    
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

// Helper functions
function getExpectedSlideCount(slideType: string, article?: Article): number {
  // If article is provided, calculate based on content length
  if (article) {
    const wordCount = article.word_count || 0;
    const contentLength = article.body.length;
    
    console.log(`📊 Content analysis: ${wordCount} words, ${contentLength} chars`);
    
    // Content-based slide calculation
    if (wordCount < 200) return 3;
    if (wordCount < 400) return 4; 
    if (wordCount < 600) return 5;
    if (wordCount < 800) return 6;
    if (wordCount < 1200) return 7;
    return 8; // Maximum for very long articles
  }
  
  // Fallback to slideType if no article provided
  switch (slideType) {
    case 'short': return 4;
    case 'tabloid': return 6;
    case 'indepth': return 8;
    case 'extensive': return 12;
    default: return 6;
  }
}

function estimateTokenUsage(text: string): number {
  return Math.ceil(text.length / 4); // Rough approximation
}

// PHASE 2: Story Type Analysis
function analyzeStoryType(title: string, body: string): {
  type: 'breaking' | 'feature' | 'routine' | 'analysis',
  significance: 'high' | 'medium' | 'low',
  angles: string[]
} {
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  
  // Breaking news indicators
  const breakingKeywords = ['breaking', 'urgent', 'emergency', 'evacuation', 'arrest', 'crash', 'fire', 'shooting'];
  const isBreaking = breakingKeywords.some(keyword => titleLower.includes(keyword));
  
  // Significance indicators
  const highSignificanceWords = ['killed', 'died', 'death', 'critical', 'life-threatening', 'major', 'massive'];
  const routineWords = ['urged', 'warning', 'appeal', 'reminder', 'advice'];
  
  const hasHighSignificance = highSignificanceWords.some(word => titleLower.includes(word));
  const isRoutine = routineWords.some(word => titleLower.includes(word));
  
  // Story angles detection
  const angles = [];
  if (bodyLower.includes('social media') || bodyLower.includes('viral') || bodyLower.includes('tiktok') || bodyLower.includes('instagram')) {
    angles.push('social media trend');
  }
  if (bodyLower.includes('technology') || bodyLower.includes('app') || bodyLower.includes('digital')) {
    angles.push('technology impact');
  }
  if (bodyLower.includes('climate') || bodyLower.includes('environment') || bodyLower.includes('weather')) {
    angles.push('environmental factor');
  }
  if (bodyLower.includes('community') || bodyLower.includes('local') || bodyLower.includes('residents')) {
    angles.push('community impact');
  }
  if (bodyLower.includes('safety') || bodyLower.includes('warning') || bodyLower.includes('danger')) {
    angles.push('public safety');
  }
  
  // Determine story type
  let type: 'breaking' | 'feature' | 'routine' | 'analysis';
  if (isBreaking) type = 'breaking';
  else if (isRoutine) type = 'routine';
  else if (angles.length > 1) type = 'analysis';
  else type = 'feature';
  
  // Determine significance
  let significance: 'high' | 'medium' | 'low';
  if (hasHighSignificance) significance = 'high';
  else if (isRoutine) significance = 'low';
  else significance = 'medium';
  
  return { type, significance, angles };
}

// Extract hook promises from headline for validation
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

// Validate that slides deliver on headline promises
function validatePromiseDelivery(slides: SlideContent[], promises: string[]): boolean {
  if (promises.length === 0) return true;
  
  const allSlideContent = slides.map(s => s.content.toLowerCase()).join(' ');
  
  // Check if at least 70% of promises are addressed in slides
  const deliveredPromises = promises.filter(promise => 
    allSlideContent.includes(promise) || 
    allSlideContent.includes(promise.replace('y', 'ies')) || // secrecy -> secrets
    allSlideContent.includes(promise.substring(0, promise.length - 1)) // rivalry -> rival
  );
  
  return deliveredPromises.length >= Math.ceil(promises.length * 0.7);
}

// Calculate temporal references from article publication date
function calculateTemporalContext(publishedAt: string): { [key: string]: string } {
  const pubDate = new Date(publishedAt);
  const today = new Date();
  
  // Calculate days difference
  const timeDiff = today.getTime() - pubDate.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
  
  // Helper to format dates
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric',
      month: 'long'
    });
  };
  
  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Generate contextual references
  let temporal = '';
  let temporalShort = '';
  
  if (daysDiff === 0) {
    temporal = 'today';
    temporalShort = 'today';
  } else if (daysDiff === 1) {
    temporal = 'yesterday';
    temporalShort = 'yesterday';
  } else if (daysDiff === 2) {
    temporal = 'two days ago';
    temporalShort = '2 days ago';
  } else if (daysDiff <= 7) {
    temporal = `${daysDiff} days ago`;
    temporalShort = `${daysDiff}d ago`;
  } else if (daysDiff <= 14) {
    temporal = 'last week';
    temporalShort = '1w ago';
  } else if (daysDiff <= 30) {
    temporal = `${Math.floor(daysDiff / 7)} weeks ago`;
    temporalShort = `${Math.floor(daysDiff / 7)}w ago`;
  } else {
    temporal = formatDate(pubDate);
    temporalShort = formatDate(pubDate);
  }
  
  return {
    temporal,
    temporalShort,
    fullDate: formatDate(pubDate),
    fullDateTime: formatDateTime(pubDate),
    daysDiff: daysDiff.toString()
  };
}

// PHASE 3: AI Generation Functions (OpenAI)
async function generateSlides(
  article: Article, 
  slideType: string, 
  apiKey: string, 
  publicationName: string,
  supabaseClient: any,
  ctaConfig: any = null,
  basePrompt: string = '',
  tonePrompt: string = '', 
  expertisePrompt: string = '',
  slideTypePrompt: string = ''
): Promise<SlideContent[]> {
  const slideCount = getExpectedSlideCount(slideType, article);
  const storyAnalysis = analyzeStoryType(article.title, article.body);
  const temporalContext = article.published_at ? calculateTemporalContext(article.published_at) : null;
  
  // Prepare CTA content
  const ctaText = ctaConfig?.engagement_question || 'What are your thoughts on this story?';
  const attributionCTA = ctaConfig?.attribution_cta || 'Read the full story via link in bio';
  
  // Build enhanced system prompt using templates
  const enhancedSystemPrompt = `
${basePrompt || 'You are an expert content creator specializing in transforming news articles into engaging social media carousel slides for Instagram and Facebook.'}

${tonePrompt || 'Use professional, engaging language that balances credibility with accessibility.'}

${expertisePrompt || 'Balance technical accuracy with accessibility. Briefly explain specialized terms.'}

${slideTypePrompt || 'Create balanced content with good detail. Include context and key supporting information.'}

CRITICAL REQUIREMENTS:
1. Extract ONLY factual information from the source article
2. Do not add speculation, opinion, or information not explicitly stated in the source
3. Always attribute information to the source publication: "${publicationName}"
4. Include temporal context: ${temporalContext ? `This story was published ${temporalContext.temporal}` : 'Recent story'}
5. Generate EXACTLY ${slideCount} slides - NO MORE, NO LESS
6. Keep slides concise and engaging
7. Use present tense for recent events, past tense for historical references
8. Always include source attribution in the final slide

MANDATORY SLIDE COUNT: ${slideCount} SLIDES ONLY
${slideCount === 4 ? 'SHORT FORMAT: 4 slides total' : ''}
${slideCount === 6 ? 'TABLOID FORMAT: 6 slides total' : ''}
${slideCount === 8 ? 'IN-DEPTH FORMAT: 8 slides total' : ''}
${slideCount === 12 ? 'EXTENSIVE FORMAT: 12 slides total' : ''}

SLIDE STRUCTURE for ${slideType} format:
- Slide 1: Hook/Headline (15-20 words max) - Grab attention
- Slides 2-${slideCount-1}: Key facts and details (20-35 words each) - Build the story
- Slide ${slideCount}: Call to action with source attribution (25-40 words)
  ${ctaConfig ? `Final slide must include: "${ctaText}" and "${attributionCTA}"` : ''}

STORY TYPE: ${storyAnalysis.type} (${storyAnalysis.significance} significance)
${storyAnalysis.angles.length > 0 ? `KEY ANGLES: ${storyAnalysis.angles.join(', ')}` : ''}

SOURCE PUBLICATION: ${publicationName}
TEMPORAL CONTEXT: ${temporalContext ? temporalContext.temporal : 'Recent'}

IMPORTANT: You must return exactly ${slideCount} slides. The response must contain slideNumber 1 through ${slideCount} only.

Return a JSON object with "slides" array containing exactly ${slideCount} slides. Each slide must have:
- slideNumber (1-${slideCount})
- content (text for the slide)
- visualPrompt (description for image generation)
- altText (accessibility description)

EXAMPLE RESPONSE STRUCTURE:
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "🚨 Breaking: Major incident unfolds in local area",
      "visualPrompt": "News breaking graphic with bold text overlay",
      "altText": "Breaking news announcement about local incident"
    }
    // ... continue until slide ${slideCount}
  ]
}`;

  const systemPrompt = enhancedSystemPrompt;

  const userPrompt = `Transform this news article into EXACTLY ${slideCount} engaging carousel slides:

HEADLINE: ${article.title}

ARTICLE BODY:
${article.body}

SOURCE URL: ${article.source_url}
AUTHOR: ${article.author || 'Staff Reporter'}
PUBLISHED: ${temporalContext ? temporalContext.fullDateTime : 'Recently'}

REMINDER: Create EXACTLY ${slideCount} slides - this is mandatory. Do not create more or fewer slides.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    if (!result.slides || !Array.isArray(result.slides)) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Validate and enforce exact slide count
    let validatedSlides = result.slides;
    
    console.log(`🔍 OpenAI generated ${validatedSlides.length} slides, expected ${slideCount}`);
    
    if (validatedSlides.length !== slideCount) {
      console.log(`⚠️ AI generated ${validatedSlides.length} slides but expected ${slideCount}. Adjusting...`);
      
      if (validatedSlides.length > slideCount) {
        // Trim excess slides - keep first slides and ensure last slide has CTA content
        const lastSlide = validatedSlides[validatedSlides.length - 1];
        const hasCtaContent = lastSlide.content.toLowerCase().includes('thoughts') || 
                             lastSlide.content.toLowerCase().includes('story') ||
                             lastSlide.content.toLowerCase().includes('read');
        
        if (hasCtaContent && slideCount > 1) {
          // Keep first (slideCount-1) slides and the CTA slide
          validatedSlides = [
            ...validatedSlides.slice(0, slideCount - 1),
            lastSlide
          ];
        } else {
          // Just take first slideCount slides
          validatedSlides = validatedSlides.slice(0, slideCount);
        }
        
        // Renumber slides sequentially
        validatedSlides = validatedSlides.map((slide, index) => ({
          ...slide,
          slideNumber: index + 1
        }));
      } else if (validatedSlides.length < slideCount) {
        // If fewer slides than expected, add content slides before final CTA
        const lastSlide = validatedSlides[validatedSlides.length - 1];
        const contentToExpand = article.body.substring(0, 200);
        
        while (validatedSlides.length < slideCount) {
          const newSlideNum = validatedSlides.length;
          validatedSlides.splice(-1, 0, { // Insert before last slide
            slideNumber: newSlideNum,
            content: `${contentToExpand.split('.')[newSlideNum - 2] || 'More details on this developing story'}.`,
            visualPrompt: `Visual illustration for: ${article.title}`,
            altText: `Additional details about ${article.title}`
          });
        }
        
        // Renumber all slides
        validatedSlides = validatedSlides.map((slide, index) => ({
          ...slide,
          slideNumber: index + 1
        }));
      }
      
      console.log(`✅ Adjusted to exactly ${validatedSlides.length} slides`);
    }
    
    // Final validation
    if (validatedSlides.length !== slideCount) {
      console.error(`❌ Failed to achieve target slide count. Got ${validatedSlides.length}, expected ${slideCount}`);
      throw new Error(`Slide count validation failed: generated ${validatedSlides.length}, expected ${slideCount}`);
    }

    return validatedSlides;
  } catch (error) {
    console.error('Error generating slides with OpenAI:', error);
    throw error;
  }
}

// Extract and validate publication name
function extractPublicationName(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const domain = url.hostname.toLowerCase();
    console.log(`🌐 Detected domain: ${domain}`);

    // Known publication mappings
    const knownPublications: { [key: string]: string } = {
      'bbc.co.uk': 'BBC News',
      'news.bbc.co.uk': 'BBC News', 
      'theguardian.com': 'The Guardian',
      'www.theguardian.com': 'The Guardian',
      'telegraph.co.uk': 'The Telegraph',
      'www.telegraph.co.uk': 'The Telegraph',
      'dailymail.co.uk': 'Daily Mail',
      'www.dailymail.co.uk': 'Daily Mail',
      'independent.co.uk': 'The Independent',
      'www.independent.co.uk': 'The Independent',
      'thetimes.co.uk': 'The Times',
      'www.thetimes.co.uk': 'The Times',
      'sky.com': 'Sky News',
      'news.sky.com': 'Sky News',
      'itv.com': 'ITV News',
      'www.itv.com': 'ITV News',
      'channel4.com': 'Channel 4 News',
      'www.channel4.com': 'Channel 4 News'
    };

    // Check for exact match first
    if (knownPublications[domain]) {
      console.log(`✅ Exact match found: ${knownPublications[domain]}`);
      return knownPublications[domain];
    }

    // Check for subdomain match
    for (const [knownDomain, publication] of Object.entries(knownPublications)) {
      if (domain.includes(knownDomain)) {
        console.log(`✅ Subdomain match found: ${publication}`);
        return publication;
      }
    }

    // Auto-generate from domain name
    const domainParts = domain.replace('www.', '').split('.');
    const mainDomain = domainParts[0];
    
    // Capitalize and clean up
    const autoGenerated = mainDomain
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    console.log(`⚠️ Auto-generated name: ${autoGenerated} (requires validation)`);
    return autoGenerated;

  } catch (error) {
    console.error('Error extracting publication name:', error);
    return 'Unknown Publication';
  }
}

// Generate Instagram post copy
async function generatePostCopy(
  article: Article, 
  slides: SlideContent[], 
  apiKey: string, 
  publicationName: string,
  basePrompt: string = '',
  tonePrompt: string = '', 
  expertisePrompt: string = ''
): Promise<{ caption: string; hashtags: string[] }> {
  
  // Build enhanced system prompt using templates
  const enhancedSystemPrompt = `
${basePrompt || 'You are a social media expert creating Instagram captions that drive engagement while maintaining journalistic integrity.'}

${tonePrompt || 'Use professional, engaging language that balances credibility with accessibility.'}

${expertisePrompt || 'Balance technical accuracy with accessibility. Briefly explain specialized terms when needed.'}

REQUIREMENTS:
1. Create engaging caption that complements the carousel slides
2. Include source attribution to "${publicationName}"
3. Add relevant hashtags (8-15 hashtags)
4. Keep tone professional but engaging
5. Include call-to-action
6. Stay factual - no speculation or opinion

CAPTION STRUCTURE:
- Hook line (attention grabber)
- Brief story summary
- Key insight or impact
- Source attribution 
- Call to action

Return JSON with "caption" and "hashtags" array.`;

  const systemPrompt = enhancedSystemPrompt;

  const userPrompt = `Create an Instagram caption for this story:

HEADLINE: ${article.title}
SLIDES CONTENT: ${slides.map(s => s.content).join(' | ')}
SOURCE: ${publicationName}

Generate engaging caption and relevant hashtags.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error('Error generating post copy:', error);
    return {
      caption: `Breaking news: ${article.title}\n\nStory via ${publicationName}\n\n#BreakingNews #News`,
      hashtags: ['#BreakingNews', '#News', '#Update']
    };
  }
}

// PHASE 4: AI Generation Functions (DeepSeek)
async function generateSlidesWithDeepSeek(
  article: Article, 
  slideType: string, 
  apiKey: string, 
  publicationName: string,
  supabaseClient: any,
  ctaConfig: any = null,
  basePrompt: string = '',
  tonePrompt: string = '', 
  expertisePrompt: string = '',
  slideTypePrompt: string = ''
): Promise<SlideContent[]> {
  const slideCount = getExpectedSlideCount(slideType, article);
  const storyAnalysis = analyzeStoryType(article.title, article.body);
  const temporalContext = article.published_at ? calculateTemporalContext(article.published_at) : null;
  
  // Prepare CTA content
  const ctaText = ctaConfig?.engagement_question || 'What are your thoughts on this story?';
  const attributionCTA = ctaConfig?.attribution_cta || 'Read the full story via link in bio';
  
  // Build enhanced system prompt using templates
  const enhancedSystemPrompt = `
${basePrompt || 'You are a world-class viral content strategist and master storyteller who creates scroll-stopping, engagement-driving Instagram carousel content.'}

${tonePrompt || 'Use engaging, dynamic language that draws readers in while maintaining credibility and professionalism.'}

${expertisePrompt || 'Balance technical accuracy with accessibility. Briefly explain specialized terms.'}

${slideTypePrompt || 'Create balanced content with good detail. Include context and key supporting information.'}

🎯 VIRAL ENGAGEMENT MASTERY:
- Generate exactly ${slideCount} slides that DEMAND attention and STOP the scroll
- Each slide: 15-25 words of pure IMPACT and emotional PUNCH
- HOOK RELENTLESSLY: Use jaw-dropping statements, shocking statistics, burning questions
- Deploy POWER WORDS: BREAKING, EXCLUSIVE, SHOCKING, REVEALED, URGENT, SECRET, FINALLY
- Create EMOTIONAL MAGNETISM: curiosity, surprise, concern, excitement, outrage
- Build COMPELLING NARRATIVE ARC: Problem → Stakes → Revelation → Impact
- END WITH EXPLOSIVE BANG: Strong CTA or mind-blowing conclusion

🔥 VIRAL SLIDE FORMULA:
1. HOOK SLIDE: "You won't believe what just happened..." / "This changes EVERYTHING..." / "🚨 BREAKING:"
2. STAKES SLIDE: "Here's why this matters to YOU..." / "The implications are MASSIVE..."
3. REVELATION SLIDES: Unveil facts like plot twists with emotional impact
4. IMPACT SLIDE: "This means..." / "The consequences could be..." 
5. CTA SLIDE: Action-driving conclusion with source attribution

MANDATORY CONTENT RULES:
- Extract ONLY factual information from source article - NO speculation
- Always attribute to "${publicationName}" 
- Generate EXACTLY ${slideCount} slides - NO MORE, NO LESS
- Temporal context: ${temporalContext ? `Published ${temporalContext.temporal}` : 'Recent story'}
- Present tense for recent events, past tense for historical references

SLIDE STRUCTURE for ${slideType} format (${slideCount} total):
- Slide 1: HOOK (15-20 words) - GRAB attention with shocking opener
- Slides 2-${slideCount-1}: REVELATIONS (20-35 words each) - Build story with emotional impact
- Slide ${slideCount}: EXPLOSIVE CTA with attribution (25-40 words)
  ${ctaConfig ? `Must include: "${ctaText}" and "${attributionCTA}"` : ''}

STORY TYPE: ${storyAnalysis.type} (${storyAnalysis.significance} significance)
${storyAnalysis.angles.length > 0 ? `ANGLE FOCUS: ${storyAnalysis.angles.join(', ')}` : ''}
SOURCE: ${publicationName} | CONTEXT: ${temporalContext ? temporalContext.temporal : 'Recent'}

Return JSON with "slides" array containing exactly ${slideCount} slides:
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "🚨 BREAKING: Shocking development rocks local community",
      "visualPrompt": "Dramatic breaking news graphic with bold impact text",
      "altText": "Breaking news alert about shocking community development"
    }
    // ... continue until slide ${slideCount}
  ]
}`;

  const systemPrompt = enhancedSystemPrompt;

  const userPrompt = `Transform this news article into EXACTLY ${slideCount} engaging carousel slides:

HEADLINE: ${article.title}

ARTICLE BODY:
${article.body}

SOURCE URL: ${article.source_url}
AUTHOR: ${article.author || 'Staff Reporter'}
PUBLISHED: ${temporalContext ? temporalContext.fullDateTime : 'Recently'}

REMINDER: Create EXACTLY ${slideCount} slides - this is mandatory. Do not create more or fewer slides.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    if (!result.slides || !Array.isArray(result.slides)) {
      throw new Error('Invalid response format from DeepSeek');
    }

    // Validate and enforce exact slide count
    let validatedSlides = result.slides;
    
    console.log(`🔍 DeepSeek generated ${validatedSlides.length} slides, expected ${slideCount}`);
    
    if (validatedSlides.length !== slideCount) {
      console.log(`⚠️ AI generated ${validatedSlides.length} slides but expected ${slideCount}. Adjusting...`);
      
      if (validatedSlides.length > slideCount) {
        // Trim excess slides - keep first slides and ensure last slide has CTA content
        const lastSlide = validatedSlides[validatedSlides.length - 1];
        const hasCtaContent = lastSlide.content.toLowerCase().includes('thoughts') || 
                             lastSlide.content.toLowerCase().includes('story') ||
                             lastSlide.content.toLowerCase().includes('read');
        
        if (hasCtaContent && slideCount > 1) {
          // Keep first (slideCount-1) slides and the CTA slide
          validatedSlides = [
            ...validatedSlides.slice(0, slideCount - 1),
            lastSlide
          ];
        } else {
          // Just take first slideCount slides
          validatedSlides = validatedSlides.slice(0, slideCount);
        }
        
        // Renumber slides sequentially
        validatedSlides = validatedSlides.map((slide, index) => ({
          ...slide,
          slideNumber: index + 1
        }));
      } else if (validatedSlides.length < slideCount) {
        // If fewer slides than expected, add content slides before final CTA
        const lastSlide = validatedSlides[validatedSlides.length - 1];
        const contentToExpand = article.body.substring(0, 200);
        
        while (validatedSlides.length < slideCount) {
          const newSlideNum = validatedSlides.length;
          validatedSlides.splice(-1, 0, { // Insert before last slide
            slideNumber: newSlideNum,
            content: `${contentToExpand.split('.')[newSlideNum - 2] || 'More details on this developing story'}.`,
            visualPrompt: `Visual illustration for: ${article.title}`,
            altText: `Additional details about ${article.title}`
          });
        }
        
        // Renumber all slides
        validatedSlides = validatedSlides.map((slide, index) => ({
          ...slide,
          slideNumber: index + 1
        }));
      }
      
      console.log(`✅ Adjusted to exactly ${validatedSlides.length} slides`);
    }
    
    // Final validation
    if (validatedSlides.length !== slideCount) {
      console.error(`❌ Failed to achieve target slide count. Got ${validatedSlides.length}, expected ${slideCount}`);
      throw new Error(`Slide count validation failed: generated ${validatedSlides.length}, expected ${slideCount}`);
    }

    return validatedSlides;
  } catch (error) {
    console.error('Error generating slides with DeepSeek:', error);
    throw error;
  }
}

// Generate Instagram post copy with DeepSeek
async function generatePostCopyWithDeepSeek(
  article: Article, 
  slides: SlideContent[], 
  apiKey: string, 
  publicationName: string,
  basePrompt: string = '',
  tonePrompt: string = '', 
  expertisePrompt: string = ''
): Promise<{ caption: string; hashtags: string[] }> {
  
  // Build enhanced system prompt using templates
  const enhancedSystemPrompt = `
${basePrompt || 'You are an elite social media strategist and viral content expert who creates Instagram captions that drive massive engagement.'}

${tonePrompt || 'Use dynamic, compelling language that draws readers in while maintaining credibility and professionalism.'}

${expertisePrompt || 'Balance technical accuracy with accessibility. Make content approachable without dumbing it down.'}

🎯 VIRAL CAPTION MASTERY:
- Create captions that complement carousel slides with explosive engagement potential
- Always include source attribution to "${publicationName}" (non-negotiable)
- Generate 10-15 strategic hashtags for maximum reach and discovery
- Balance professional credibility with irresistible social media magnetism
- Include multiple engagement triggers and compelling calls-to-action
- Stay 100% factual - zero speculation or opinion (journalistic integrity first)

🔥 ENGAGEMENT-DRIVEN CAPTION STRUCTURE:
1. HOOK LINE: Jaw-dropping opener that stops the scroll instantly
2. STORY AMPLIFICATION: Transform facts into compelling narrative
3. IMPACT REVELATION: Make it personal and relevant
4. SOURCE ATTRIBUTION: Professional credibility anchor
5. EXPLOSIVE CTA: Drive maximum interaction

✨ VIRAL ENGAGEMENT TRIGGERS (MANDATORY):
- Use PROVOCATIVE QUESTIONS that demand responses
- Include EMOTIONAL HOOKS: surprise, concern, curiosity, outrage, hope
- Add RELATABLE SCENARIOS: "Imagine if this happened to YOU..."
- Create DEBATE STARTERS: "Is this fair?" / "Should this be allowed?"
- Include SOCIAL PROOF: "Thousands are already discussing this..."
- Use URGENCY: "This is happening NOW..." / "Don't miss out on this story"
- Add COMMUNITY BUILDERS: "Who else is following this story?"

Return JSON with "caption" and "hashtags" array.`;

  const systemPrompt = enhancedSystemPrompt;

  const userPrompt = `Create an Instagram caption for this story:

HEADLINE: ${article.title}
SLIDES CONTENT: ${slides.map(s => s.content).join(' | ')}
SOURCE: ${publicationName}

Generate engaging caption and relevant hashtags.`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error('Error generating post copy with DeepSeek:', error);
    return {
      caption: `Breaking news: ${article.title}\n\nStory via ${publicationName}\n\n#BreakingNews #News`,
      hashtags: ['#BreakingNews', '#News', '#Update']
    };
  }
}