import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { ContentValidator } from '../_shared/content-validator.ts';

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
  source_url: string;
  published_at: string;
}

interface SlideContent {
  slideNumber: number;
  content: string;
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
    const deepSeekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    const useDeepSeek = Deno.env.get('USE_DEEPSEEK') === 'true';
    
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasOpenAIKey: !!openAIApiKey,
      hasDeepSeekKey: !!deepSeekApiKey,
      useDeepSeek: useDeepSeek
    });
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables');
    }
    
    if (useDeepSeek && !deepSeekApiKey) {
      throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek');
    }
    
    if (!useDeepSeek && !openAIApiKey) {
      throw new Error('OPENAI_API_KEY is required when using OpenAI');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { articleId, slideType = 'tabloid', aiProvider } = await req.json();

    console.log('Processing article ID:', articleId, 'with AI provider:', aiProvider || 'from env');

    if (!articleId) {
      throw new Error('Article ID is required');
    }

    // Determine AI provider - use from request if provided, otherwise fall back to env variable
    const selectedProvider = aiProvider ? aiProvider === 'deepseek' : useDeepSeek;

    // Fetch the article with published_at for temporal context
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('*, published_at')
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
    let story = null;
    const { data: existingStory, error: storySelectError } = await supabase
      .from('stories')
      .select('*')
      .eq('article_id', articleId)
      .single();

    if (storySelectError && storySelectError.code !== 'PGRST116') {
      console.error('Error checking for existing story:', storySelectError);
      throw new Error(`Failed to check for existing story: ${storySelectError.message}`);
    }

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
      throw new Error('Failed to create or retrieve story');
    }

    console.log('Using story:', story.id);

    // Extract publication name from source URL first for proper attribution in slides
    const publicationName = await extractPublicationName(article.source_url, supabase, articleId);
    console.log(`✅ Validated publication: ${publicationName}`);

    console.log('🤖 Starting slide generation for article:', article.title);
    
    // Extract hook promises from headline for validation
    const hookPromises = extractHookPromises(article.title);
    console.log('🎯 Extracted hook promises from headline:', hookPromises);
    
    // Generate slides using selected AI provider
    const selectedAiProvider = selectedProvider ? 'DeepSeek' : 'OpenAI';
    const apiKey = selectedProvider ? deepSeekApiKey : openAIApiKey;
    console.log(`🎯 Generating slides using ${selectedAiProvider} with slideType: ${slideType}, expected count: ${slideType === 'short' ? 4 : slideType === 'indepth' ? 12 : 8}`);
    
    let slides;
    let slideGenerationCost = 0;
    try {
      const slideResult = selectedProvider 
        ? await generateSlidesWithDeepSeek(article, deepSeekApiKey, slideType, publicationName)
        : await generateSlides(article, openAIApiKey, slideType, publicationName);
      
      slides = slideResult.slides;
      slideGenerationCost = slideResult.estimatedCost || 0;
      console.log(`📊 Generated ${slides?.length || 0} slides using ${selectedAiProvider} vs expected ${slideType === 'short' ? 4 : slideType === 'indepth' ? 12 : 8}, cost: $${slideGenerationCost.toFixed(4)}`);
      
      if (!slides || slides.length === 0) {
        console.error('❌ No slides generated for article:', article.title);
        // Reset story status and delete story if no slides were created
        await supabase
          .from('stories')
          .delete()
          .eq('id', story.id);
        
        throw new Error('Failed to generate slides');
      }
    } catch (slideError) {
      console.error('❌ Error during slide generation:', slideError);
      // Reset story status and delete story if no slides were created
      await supabase
        .from('stories')
        .delete()
        .eq('id', story.id);
      
      throw slideError;
    }

    // Validate promise delivery if promises were detected
    if (hookPromises.length > 0) {
      const promisesDelivered = validatePromiseDelivery(slides, hookPromises);
      console.log('📋 Promise delivery validation:', {
        promises: hookPromises,
        delivered: promisesDelivered
      });

      if (!promisesDelivered) {
        console.log('⚠️ Slides failed promise delivery validation, regenerating...');
        // Regenerate with explicit promise delivery requirement
        const regenerationResult = selectedProvider 
          ? await generateSlidesWithDeepSeek(article, deepSeekApiKey, slideType, publicationName, hookPromises)
          : await generateSlides(article, openAIApiKey, slideType, publicationName, hookPromises);
        slides = regenerationResult.slides;
        
        // Validate again
        const secondValidation = validatePromiseDelivery(slides, hookPromises);
        if (!secondValidation) {
          console.warn('⚠️ Second generation also failed promise validation, proceeding with content');
        } else {
          console.log('✅ Second generation passed promise validation');
        }
      } else {
        console.log('✅ Slides passed promise delivery validation');
      }
    }

    console.log(`✅ Generated ${slides.length} slides for article: ${article.title}`);

    // Validate slides for factual accuracy
    const validator = new ContentValidator();
    const validationResult = validator.validateSlides(slides, article.title, article.body);
    
    console.log('📋 Content validation result:', {
      score: validationResult.score,
      isValid: validationResult.isValid,
      issues: validationResult.issues.length
    });

    // Log validation issues if any
    if (validationResult.issues.length > 0) {
      console.warn('⚠️ Content validation issues detected:', validationResult.issues);
      
      // Log validation issues for review
      await supabase
        .from('system_logs')
        .insert({
          level: 'warning',
          message: `Content validation issues detected for article: ${article.title}`,
          context: {
            validation_score: validationResult.score,
            issues: validationResult.issues,
            fabricated_topics: validationResult.fabricatedTopics,
            article_id: articleId,
            story_id: story.id
          },
          function_name: 'content-generator'
        });

      // If validation score is too low, regenerate with stricter prompts
      if (validationResult.score < 70) {
        console.log('🔄 Validation score too low, attempting regeneration with stricter constraints...');
        
        try {
          const strictSlideResult = selectedProvider 
            ? await generateSlidesWithDeepSeek(article, deepSeekApiKey, slideType, publicationName, hookPromises)
            : await generateSlides(article, openAIApiKey, slideType, publicationName, hookPromises);
          const revalidation = validator.validateSlides(strictSlideResult.slides, article.title, article.body);
          
          if (revalidation.score > validationResult.score) {
            console.log('✅ Regeneration improved validation score from', validationResult.score, 'to', revalidation.score);
            slides = strictSlideResult.slides;
          } else {
            console.log('⚠️ Regeneration did not improve validation score, using original');
          }
        } catch (regenError) {
          console.error('Failed to regenerate slides:', regenError);
        }
      }
    }

    // Generate social media post copy with hashtags
    const postResult = selectedProvider 
      ? await generatePostCopyWithDeepSeek(article, publicationName, deepSeekApiKey)
      : await generatePostCopy(article, publicationName, openAIApiKey);
    console.log('Generated post copy:', postResult.postCopy);
    
    const totalApiCost = slideGenerationCost + (postResult.estimatedCost || 0);
    console.log(`💰 Total API cost for story generation: $${totalApiCost.toFixed(4)}`);

    // Delete any existing slides and posts for this story
    if (existingStory) {
      const { error: deleteError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', existingStory.id);
      
      if (deleteError) {
        console.error('Error deleting existing slides:', deleteError);
      }

      // Delete existing posts
      const { error: deletePostError } = await supabase
        .from('posts')
        .delete()
        .eq('story_id', existingStory.id);
      
      if (deletePostError) {
        console.error('Error deleting existing posts:', deletePostError);
      }
    }

    // Verify story still exists before inserting slides (handles race conditions)
    const { data: storyCheck, error: storyCheckError } = await supabase
      .from('stories')
      .select('id')
      .eq('id', story.id)
      .single();

    if (storyCheckError || !storyCheck) {
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
        status: 'draft',
        is_published: true,
        publication_name: publicationName,
        author: article.author
      })
      .eq('id', story.id);

    if (storyUpdateError) {
      console.error('Error updating story:', storyUpdateError);
      throw new Error(`Failed to update story: ${storyUpdateError.message}`);
    }

    // Update the article processing status to 'processed' so it disappears from content pipeline
    const { error: articleUpdateError } = await supabase
      .from('articles')
      .update({ processing_status: 'processed' })
      .eq('id', articleId);

    if (articleUpdateError) {
      console.error('Error updating article processing status:', articleUpdateError);
      // Don't throw error - story creation succeeded, this is just cleanup
    } else {
      console.log('Article processing status updated to processed');
    }

    // Track API usage for both slide generation and post copy
    try {
      await supabase
        .from('api_usage')
        .insert({
          service_name: selectedAiProvider,
          operation: 'content-generation',
          tokens_used: Math.round(totalApiCost * 50000), // Estimate tokens from cost
          cost_usd: totalApiCost,
          region: article.region || 'Eastbourne'
        });
      console.log(`💰 Logged API usage: $${totalApiCost.toFixed(4)}`);
    } catch (apiLogError) {
      console.error('Failed to log API usage:', apiLogError);
    }

    // Create a post record with the generated content
    const { error: postError } = await supabase
      .from('posts')
      .insert({
        story_id: story.id,
        platform: 'instagram', // Default to Instagram
        caption: postResult.postCopy.caption,
        hashtags: postResult.postCopy.hashtags,
        source_attribution: sourceAttribution,
        status: 'draft'
      });

    if (postError) {
      console.error('Error creating post:', postError);
      // Don't throw error for post creation as slides are more important
    }

    console.log('Updated story status to draft and published for review...');

    // Automatically trigger carousel image generation
    try {
      console.log('🖼️ Triggering automatic carousel image generation...');
      const carouselResult = await supabase.functions.invoke('generate-carousel-images', {
        body: { 
          storyId: story.id,
          formats: ['instagram_story', 'instagram_post', 'facebook_post']
        }
      });

      if (carouselResult.error) {
        console.error('Auto-carousel generation failed:', carouselResult.error);
        // Don't fail the main process, just log it
      } else {
        console.log('✅ Auto-carousel generation started successfully');
      }
    } catch (carouselError) {
      console.error('Auto-carousel generation error:', carouselError);
      // Don't fail the main process, just log it
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        storyId: story.id,
        slideCount: slides.length,
        slides: slides,
        autoPublished: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ ERROR in content-generator function:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // If we have a story ID, reset its status to draft so it can be retried
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      const supabaseInstance = createClient(supabaseUrl, supabaseKey);
      
      if (story?.id) {
        try {
          console.log('🔄 Resetting story status to draft due to error...');
          await supabaseInstance
            .from('stories')
            .update({ status: 'draft' })
            .eq('id', story.id);
        } catch (resetError) {
          console.error('Failed to reset story status:', resetError);
        }
      }
    }
    
    // Log detailed error for debugging
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `Content generation failed: ${error.message}`,
          context: {
            error_type: error.name,
            error_message: error.message,
            story_id: story?.id,
            article_id: articleId
          },
          function_name: 'content-generator'
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: 'Story has been reset to draft status for retry'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

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
  const formatDate = (date: Date) => 
    date.toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  
  // Calculate temporal mappings
  const yesterday = new Date(pubDate);
  yesterday.setDate(pubDate.getDate() - 1);
  
  const tomorrow = new Date(pubDate);
  tomorrow.setDate(pubDate.getDate() + 1);
  
  const lastWeek = new Date(pubDate);
  lastWeek.setDate(pubDate.getDate() - 7);
  
  return {
    'today': formatDate(pubDate),
    'yesterday': formatDate(yesterday),
    'tomorrow': formatDate(tomorrow),
    'last week': formatDate(lastWeek),
    'this week': `week of ${formatDate(pubDate)}`,
    'publication_date': formatDate(pubDate)
  };
}

async function generateSlides(article: Article, openAIApiKey: string, slideType: string = 'tabloid', publicationName: string, hookPromises?: string[]): Promise<{ slides: SlideContent[], estimatedCost: number }> {
  // Optimized single prompt template with variables
  const slideConfigs = {
    short: { count: 4, style: 'conversational', wordLimits: '15/25/35/40' },
    indepth: { count: 12, style: 'investigative', wordLimits: '15/25/30/30/30/30/35/35/35/35/40' },
    tabloid: { count: 8, style: 'dramatic', wordLimits: '15/20/30/30/30/35/35/40' }
  };
  
  const config = slideConfigs[slideType as keyof typeof slideConfigs] || slideConfigs.tabloid;
  
  // Calculate temporal context
  const temporalContext = calculateTemporalContext(article.published_at);
  
  // PHASE 1: Story Intelligence - Assess story type and significance
  const storyTypeAnalysis = analyzeStoryType(article.title, article.body);
  
  // Extract domain from source URL for final slide
  const sourceDomain = new URL(article.source_url).hostname;
  
  // Get feed CTA configuration
  const feedName = article.region || 'Default';
  const { data: ctaConfig } = await supabase
    .from('feed_cta_configs')
    .select('*')
    .eq('feed_name', feedName)
    .eq('is_active', true)
    .maybeSingle();
  
  // Fallback to default config if feed-specific config not found
  const finalCtaConfig = ctaConfig || {
    engagement_question: 'What do you think?',
    show_like_share: true,
    attribution_cta: null
  };
  
  const systemPrompt = `🚨 CRITICAL: FACTUAL ACCURACY IS NON-NEGOTIABLE 🚨

FACTUAL ACCURACY CHECKLIST - COMPLETE BEFORE WRITING:
✅ Every claim must exist in the source material
✅ No invented quotes, conversations, or events
✅ No fabricated technology connections unless explicitly mentioned
✅ No added controversies that don't exist in the original
✅ Only use information directly from the provided content

You are creating ${config.count} engaging slides from factual news content.

🎯 HOOK MASTERY - Make real content compelling:
❌ BLAND: "Rising concerns from visitors at popular natural sites urged by officials to prioritize safety"
✅ PUNCHY: "Visitors risk safety at dangerous beauty spot as officials issue urgent warning"

❌ WRONG: "AI study hacks help students achieve GCSE success" (FABRICATED - not in source)
✅ RIGHT: "Students celebrate outstanding GCSE results at local school" (FACTUAL)

❌ WRONG: "Social media trend sparks controversy" (if no social media mentioned)
✅ RIGHT: Use only angles that exist in the source material

🔥 ENGAGEMENT RULES - Work with what you have:
• ONLY use angles present in the source content
• Transform boring language into punchy language WITHOUT changing facts
• Create intrigue from REAL events, not invented drama
• STORY TYPE: ${storyTypeAnalysis.type} (${storyTypeAnalysis.significance})

🚫 ABSOLUTELY FORBIDDEN:
• Adding technology angles when none exist
• Inventing social media connections
• Creating generational conflicts not in source
• Fabricating controversies or drama
• Adding quotes or conversations not in original

⚡ STORYTELLING FORMULA - COMPLETE NARRATIVE ARC:
1. HOOK: Start with the most compelling FACTUAL angle (${config.wordLimits.split('/')[0]} words max)
2. CONTEXT: "In [Location]..." with actual details from source
3. BUILD TENSION: What actually happened according to the source
4. CLIMAX/RESOLUTION: The real outcome described in the article
5. IMPACT/CONSEQUENCE: Actual results mentioned in the source
6. FINAL SLIDE: "${finalCtaConfig.engagement_question}${finalCtaConfig.show_like_share ? ' Like, share.' : ''} Summary of a story${article.author ? ` by ${article.author}` : ''} from ${publicationName}.${finalCtaConfig.attribution_cta ? ` ${finalCtaConfig.attribution_cta},` : ''} visit ${sourceDomain} for the full story."

🎯 FACTUAL NARRATIVE REQUIREMENTS:
• SETUP: Describe the actual initial situation from the source
• CONFLICT: Use only tensions/problems mentioned in the article
• RESOLUTION: Show only the real resolution described in the source
• NEVER invent details not present in the original content

🎪 LANGUAGE ENHANCEMENT (without changing facts):
• Replace "officials say" → "authorities reveal/warn/confirm"
• Replace "concerns raised" → "warnings issued/alerts raised"
• Replace "incident occurred" → "event unfolded/situation developed"
• Use engaging language but ONLY for facts already in the source
• Replace temporal refs: "yesterday (${temporalContext.yesterday})"

WORD LIMITS: ${config.wordLimits} - Use every word for FACTUAL impact

FINAL VALIDATION: Before returning, confirm every claim exists in the source material.

Return JSON: {"slides": [{"slideNumber": 1, "content": "text", "altText": "description"}]}`;

  // FACTUAL ENGAGEMENT TRANSFORMATION
  let userPrompt = `🚨 FACTUAL ACCURACY FIRST: Only use information from the source content below.

ORIGINAL TITLE: "${article.title}"
YOUR MISSION: Make this story engaging using ONLY the facts provided

📊 STORY DETAILS:
• Publication: ${temporalContext.publication_date}
• Type: ${storyTypeAnalysis.type} (${storyTypeAnalysis.significance})
• Detected angles (if present in source): ${storyTypeAnalysis.angles.join(', ')}

📰 SOURCE CONTENT (YOUR ONLY REFERENCE):
${article.body.substring(0, 1200)}

🔒 STRICT TRANSFORMATION RULES:
1. FACT CHECK FIRST: Read the source content completely
2. IDENTIFY REAL HOOKS: What compelling angles actually exist in the source?
3. ENHANCE LANGUAGE: Make boring facts sound interesting without changing them
4. COMPLETE STORY ARC: Use only the setup, conflict, and resolution described in source
5. PUNCHY BUT ACCURATE: Upgrade language while keeping facts identical
6. NO FABRICATION: If it's not in the source, don't write it

❌ FORBIDDEN FABRICATIONS (Examples):
• Don't add "AI study hacks" if technology isn't mentioned
• Don't create "social media trends" if social media isn't in source
• Don't invent "controversy erupts" if no controversy described
• Don't add "generational clash" if generations aren't mentioned
• Don't create "viral moment" if viral activity isn't described

✅ ALLOWED ENHANCEMENTS (Examples):
• "Officials announce new rules" → "Authorities crack down with new rules"
• "People were concerned" → "Residents raised alarm"
• "Investigation ongoing" → "Mystery deepens as investigation continues"
• But ONLY if the basic fact exists in the source

📖 FACTUAL STORY CHECKLIST:
• Rescue story? WHO rescued and HOW (from source only)
• Problem story? HOW was it solved (from source only)
• Conflict story? WHAT was the real outcome (from source only)
• Celebration story? WHAT are they celebrating (from source only)
• NEVER add details not present in the original

🎯 CONTENT VALIDATION:
Before writing each slide, ask: "Is this information in the source material?"
If no, rewrite using only factual content.

Transform boring language into engaging language, but keep identical facts!`;

// Add hook promise delivery requirements with factual validation
  if (hookPromises && hookPromises.length > 0) {
    userPrompt += `\n\n🎯 HOOK PROMISES TO FULFILL: ${hookPromises.join(', ')} 
- These promises MUST be delivered with specific details FROM THE SOURCE ONLY
- Don't just mention them - show how they're addressed in the actual story
- CRITICAL: Only use promise details that exist in the source material`;
  }

  // Add final validation reminder
  userPrompt += `\n\n🔒 FINAL VALIDATION BEFORE SUBMITTING:
1. Read each slide and ask: "Does this claim exist in the source?"
2. Check for any technology/AI/social media angles not in original
3. Verify all quotes and events are from the source material
4. Confirm no controversies or conflicts were invented
5. Ensure language is punchy but facts are identical to source`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14', // Upgraded model for better creative output and engaging style
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: slideType === 'indepth' ? 2500 : 1500, // Reduced tokens for standard content
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
  
  // Calculate estimated cost based on token usage
  const inputTokens = data.usage?.prompt_tokens || 1000; // Fallback estimate
  const outputTokens = data.usage?.completion_tokens || 500; // Fallback estimate
  const estimatedCost = (inputTokens * 0.00001) + (outputTokens * 0.00003); // GPT-4.1 pricing
  
  let content = data.choices[0].message.content;
  console.log('Raw OpenAI response content:', content);
  
  // Clean the response - extract only the JSON part
  try {
    // Try to parse the content directly first
    let parsed;
    try {
      parsed = JSON.parse(content);
      console.log('Direct parse successful:', parsed);
    } catch (directParseError) {
      console.log('Direct parse failed, attempting extraction...');
      
      // Find the JSON object boundaries - try multiple patterns
      let jsonStart = content.indexOf('{"slides"');
      if (jsonStart === -1) {
        jsonStart = content.indexOf('{\n  "slides"');
      }
      if (jsonStart === -1) {
        jsonStart = content.indexOf('{ "slides"');
      }
      if (jsonStart === -1) {
        // Look for any opening brace followed by "slides"
        const slidesIndex = content.indexOf('"slides"');
        if (slidesIndex > -1) {
          // Search backwards for opening brace
          for (let i = slidesIndex; i >= 0; i--) {
            if (content[i] === '{') {
              jsonStart = i;
              break;
            }
          }
        }
      }
      
      if (jsonStart === -1) {
        throw new Error('No valid JSON structure found in response');
      }
      
      // Find the end of the JSON by counting braces
      let braceCount = 0;
      let jsonEnd = jsonStart;
      for (let i = jsonStart; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
      
      // Extract clean JSON
      content = content.substring(jsonStart, jsonEnd);
      console.log('Cleaned JSON content:', content);
      parsed = JSON.parse(content);
    }
    
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
      if (!slide.slideNumber || !slide.content || !slide.altText) {
        console.error(`Invalid slide ${i}:`, slide);
        throw new Error(`Slide ${i} missing required properties`);
      }
    }
    
    return { slides: parsed.slides, estimatedCost };
  } catch (parseError) {
    console.error('JSON Parse error:', parseError);
    console.error('Raw OpenAI response content:', content);
    throw new Error(`Failed to parse AI response: ${parseError.message}`);
  }
}

// Enhanced function to extract and validate publication name from URL
async function extractPublicationName(sourceUrl: string, supabase: any, articleId?: string): Promise<string> {
  try {
    const url = new URL(sourceUrl);
    const domain = url.hostname.toLowerCase();
    const cleanDomain = domain.replace(/^www\./, '');
    
    console.log(`🔍 Extracting publication from URL: ${sourceUrl}`);
    console.log(`🌐 Detected domain: ${cleanDomain}`);
    
    // Enhanced publication mappings with validation
    const publicationMap: { [key: string]: string } = {
      'theargus.co.uk': 'The Argus',
      'sussexexpress.co.uk': 'Sussex Express', 
      'eastbourneherald.co.uk': 'The Herald',
      'brightonandhovenews.org': 'Brighton & Hove News',
      'hastingsobserver.co.uk': 'Hastings Observer',
      'bbc.co.uk': 'BBC',
      'bbc.com': 'BBC',
      'theguardian.com': 'The Guardian',
      'independent.co.uk': 'The Independent',
      'telegraph.co.uk': 'The Telegraph',
      'dailymail.co.uk': 'Daily Mail',
      'mirror.co.uk': 'Daily Mirror',
      'itv.com': 'ITV News',
      'sky.com': 'Sky News',
      'eastbourne.news': 'Eastbourne News',
      'eastsussex.news': 'East Sussex News',
      'eastbournereporter.co.uk': 'Eastbourne Reporter'
    };
    
    let extractedName = '';
    let validationStatus = 'pending';
    let isValid = true;
    
    // Check for exact match first
    if (publicationMap[cleanDomain]) {
      extractedName = publicationMap[cleanDomain];
      validationStatus = 'validated';
      console.log(`✅ Exact match found: ${extractedName}`);
    } else {
      // Try subdomain matching
      const subdomainMatch = Object.keys(publicationMap).find(key => 
        cleanDomain.includes(key) || key.includes(cleanDomain.split('.')[0])
      );
      
      if (subdomainMatch) {
        extractedName = publicationMap[subdomainMatch];
        validationStatus = 'subdomain_match';
        console.log(`🔄 Subdomain match found: ${extractedName}`);
      } else {
        // Fallback formatting with enhanced logic
        const domainParts = cleanDomain.replace(/\.(co\.uk|com|org|net|co)$/, '').split('.');
        
        if (domainParts.length > 1) {
          // Handle subdomains (e.g., news.bbc.co.uk -> BBC News)
          extractedName = domainParts
            .reverse()
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        } else {
          extractedName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
        }
        
        validationStatus = 'auto_generated';
        isValid = false; // Requires manual verification
        console.log(`⚠️ Auto-generated name: ${extractedName} (requires validation)`);
      }
    }
    
    // Log the attribution for audit trail
    if (articleId && supabase) {
      try {
        await supabase
          .from('source_attributions')
          .insert({
            article_id: articleId,
            extracted_publication: extractedName,
            source_url: sourceUrl,
            detected_domain: cleanDomain,
            validation_status: validationStatus,
            is_valid: isValid
          });
        
        console.log(`📝 Logged source attribution for article ${articleId}`);
      } catch (auditError) {
        console.error('Failed to log source attribution:', auditError);
      }
    }
    
    const finalName = extractedName || 'Local News Source';
    console.log(`📰 Final publication name: ${finalName}`);
    
    return finalName;
    
  } catch (error) {
    console.error('❌ Error extracting publication name:', error);
    
    // Log the error for debugging
    if (articleId && supabase) {
      try {
        await supabase
          .from('source_attributions')
          .insert({
            article_id: articleId,
            extracted_publication: 'Local News Source',
            source_url: sourceUrl,
            detected_domain: 'error',
            validation_status: 'error',
            is_valid: false
          });
      } catch (auditError) {
        console.error('Failed to log error attribution:', auditError);
      }
    }
    
    return 'Local News Source';
  }
}

// Optimized function to generate social media post copy
async function generatePostCopy(article: Article, publicationName: string, openAIApiKey: string): Promise<{ postCopy: { caption: string, hashtags: string[] }, estimatedCost: number }> {
  const temporalContext = calculateTemporalContext(article.published_at);
  
  const systemPrompt = `Create Instagram caption for news carousel. Include hook, summary, attribution, hashtags (8-15). Under 2000 chars. Return JSON: {"caption": "text", "hashtags": ["tag1"]}`;

  const userPrompt = `Story: ${article.title}
Content: ${article.body?.substring(0, 400)}
Published: ${temporalContext.publication_date}
Source: ${publicationName}${article.author ? `, by ${article.author}` : ''}
Region: ${article.region || 'Sussex'}

Replace relative dates with absolute dates in brackets.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 600,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const parsedResponse = JSON.parse(data.choices[0].message.content);
    
    // Calculate estimated cost for gpt-4o-mini
    const inputTokens = data.usage?.prompt_tokens || 300; // Fallback estimate
    const outputTokens = data.usage?.completion_tokens || 200; // Fallback estimate
    const estimatedCost = (inputTokens * 0.000150 / 1000) + (outputTokens * 0.000600 / 1000); // GPT-4o-mini pricing
    
    return {
      postCopy: {
        caption: parsedResponse.caption,
        hashtags: parsedResponse.hashtags || []
      },
      estimatedCost
    };
  } catch (error) {
    console.error('Error generating post copy:', error);
    return {
      postCopy: {
        caption: `${article.title} 🗞️\n\n${article.body?.substring(0, 200)}...\n\nSummarised from an article in ${publicationName}${article.author ? `, by ${article.author}` : ''}`,
        hashtags: ['LocalNews', 'Sussex', 'Community', 'News']
      },
      estimatedCost: 0
    };
  }
}

// DeepSeek implementation for slide generation
async function generateSlidesWithDeepSeek(article: Article, deepSeekApiKey: string, slideType: string = 'tabloid', publicationName: string, hookPromises?: string[]): Promise<{ slides: SlideContent[], estimatedCost: number }> {
  // Use identical configuration and prompts as OpenAI version
  const slideConfigs = {
    short: { count: 4, style: 'conversational', wordLimits: '15/25/35/40' },
    indepth: { count: 12, style: 'investigative', wordLimits: '15/25/30/30/30/30/35/35/35/35/40' },
    tabloid: { count: 8, style: 'dramatic', wordLimits: '15/20/30/30/30/35/35/40' }
  };
  
  const config = slideConfigs[slideType as keyof typeof slideConfigs] || slideConfigs.tabloid;
  const temporalContext = calculateTemporalContext(article.published_at);
  const storyTypeAnalysis = analyzeStoryType(article.title, article.body);
  const sourceDomain = new URL(article.source_url).hostname;
  
  // Get feed CTA configuration (same as OpenAI version)
  const feedName = article.region || 'Default';
  const { data: ctaConfig } = await supabase
    .from('feed_cta_configs')
    .select('*')
    .eq('feed_name', feedName)
    .eq('is_active', true)
    .maybeSingle();
  
  const finalCtaConfig = ctaConfig || {
    engagement_question: 'What do you think?',
    show_like_share: true,
    attribution_cta: null
  };
  
  // Use identical system prompt as OpenAI version
  const systemPrompt = `🚨 CRITICAL: FACTUAL ACCURACY IS NON-NEGOTIABLE 🚨

FACTUAL ACCURACY CHECKLIST - COMPLETE BEFORE WRITING:
✅ Every claim must exist in the source material
✅ No invented quotes, conversations, or events
✅ No fabricated technology connections unless explicitly mentioned
✅ No added controversies that don't exist in the original
✅ Only use information directly from the provided content

You are creating ${config.count} engaging slides from factual news content.

🎯 HOOK MASTERY - Make real content compelling:
❌ BLAND: "Rising concerns from visitors at popular natural sites urged by officials to prioritize safety"
✅ PUNCHY: "Visitors risk safety at dangerous beauty spot as officials issue urgent warning"

❌ WRONG: "AI study hacks help students achieve GCSE success" (FABRICATED - not in source)
✅ RIGHT: "Students celebrate outstanding GCSE results at local school" (FACTUAL)

❌ WRONG: "Social media trend sparks controversy" (if no social media mentioned)
✅ RIGHT: Use only angles that exist in the source material

🔥 ENGAGEMENT RULES - Work with what you have:
• ONLY use angles present in the source content
• Transform boring language into punchy language WITHOUT changing facts
• Create intrigue from REAL events, not invented drama
• STORY TYPE: ${storyTypeAnalysis.type} (${storyTypeAnalysis.significance})

🚫 ABSOLUTELY FORBIDDEN:
• Adding technology angles when none exist
• Inventing social media connections
• Creating generational conflicts not in source
• Fabricating controversies or drama
• Adding quotes or conversations not in original

⚡ STORYTELLING FORMULA - COMPLETE NARRATIVE ARC:
1. HOOK: Start with the most compelling FACTUAL angle (${config.wordLimits.split('/')[0]} words max)
2. CONTEXT: "In [Location]..." with actual details from source
3. BUILD TENSION: What actually happened according to the source
4. CLIMAX/RESOLUTION: The real outcome described in the article
5. IMPACT/CONSEQUENCE: Actual results mentioned in the source
6. FINAL SLIDE: "${finalCtaConfig.engagement_question}${finalCtaConfig.show_like_share ? ' Like, share.' : ''} Summary of a story${article.author ? ` by ${article.author}` : ''} from ${publicationName}.${finalCtaConfig.attribution_cta ? ` ${finalCtaConfig.attribution_cta},` : ''} visit ${sourceDomain} for the full story."

🎯 FACTUAL NARRATIVE REQUIREMENTS:
• SETUP: Describe the actual initial situation from the source
• CONFLICT: Use only tensions/problems mentioned in the article
• RESOLUTION: Show only the real resolution described in the source
• NEVER invent details not present in the original content

🎪 LANGUAGE ENHANCEMENT (without changing facts):
• Replace "officials say" → "authorities reveal/warn/confirm"
• Replace "concerns raised" → "warnings issued/alerts raised"
• Replace "incident occurred" → "event unfolded/situation developed"
• Use engaging language but ONLY for facts already in the source
• Replace temporal refs: "yesterday (${temporalContext.yesterday})"

WORD LIMITS: ${config.wordLimits} - Use every word for FACTUAL impact

FINAL VALIDATION: Before returning, confirm every claim exists in the source material.

Return JSON: {"slides": [{"slideNumber": 1, "content": "text", "altText": "description"}]}`;

  let userPrompt = `🚨 FACTUAL ACCURACY FIRST: Only use information from the source content below.

ORIGINAL TITLE: "${article.title}"
YOUR MISSION: Make this story engaging using ONLY the facts provided

📊 STORY DETAILS:
• Publication: ${temporalContext.publication_date}
• Type: ${storyTypeAnalysis.type} (${storyTypeAnalysis.significance})
• Detected angles (if present in source): ${storyTypeAnalysis.angles.join(', ')}

📰 SOURCE CONTENT (YOUR ONLY REFERENCE):
${article.body.substring(0, 1200)}

🔒 STRICT TRANSFORMATION RULES:
1. FACT CHECK FIRST: Read the source content completely
2. IDENTIFY REAL HOOKS: What compelling angles actually exist in the source?
3. ENHANCE LANGUAGE: Make boring facts sound interesting without changing them
4. COMPLETE STORY ARC: Use only the setup, conflict, and resolution described in source
5. PUNCHY BUT ACCURATE: Upgrade language while keeping facts identical
6. NO FABRICATION: If it's not in the source, don't write it

❌ FORBIDDEN FABRICATIONS (Examples):
• Don't add "AI study hacks" if technology isn't mentioned
• Don't create "social media trends" if social media isn't in source
• Don't invent "controversy erupts" if no controversy described
• Don't add "generational clash" if generations aren't mentioned
• Don't create "viral moment" if viral activity isn't described

✅ ALLOWED ENHANCEMENTS (Examples):
• "Officials announce new rules" → "Authorities crack down with new rules"
• "People were concerned" → "Residents raised alarm"
• "Investigation ongoing" → "Mystery deepens as investigation continues"
• But ONLY if the basic fact exists in the source

📖 FACTUAL STORY CHECKLIST:
• Rescue story? WHO rescued and HOW (from source only)
• Problem story? HOW was it solved (from source only)
• Conflict story? WHAT was the real outcome (from source only)
• Celebration story? WHAT are they celebrating (from source only)
• NEVER add details not present in the original

🎯 CONTENT VALIDATION:
Before writing each slide, ask: "Is this information in the source material?"
If no, rewrite using only factual content.

Transform boring language into engaging language, but keep identical facts!`;

  if (hookPromises && hookPromises.length > 0) {
    userPrompt += `\n\n🎯 HOOK PROMISES TO FULFILL: ${hookPromises.join(', ')} 
- These promises MUST be delivered with specific details FROM THE SOURCE ONLY
- Don't just mention them - show how they're addressed in the actual story
- CRITICAL: Only use promise details that exist in the source material`;
  }

  userPrompt += `\n\n🔒 FINAL VALIDATION BEFORE SUBMITTING:
1. Read each slide and ask: "Does this claim exist in the source?"
2. Check for any technology/AI/social media angles not in original
3. Verify all quotes and events are from the source material
4. Confirm no controversies or conflicts were invented
5. Ensure language is punchy but facts are identical to source`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepSeekApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: slideType === 'indepth' ? 2500 : 1500,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('DeepSeek API error details:', {
      status: response.status,
      statusText: response.statusText,
      errorData: errorData
    });
    throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorData}`);
  }

  const data = await response.json();
  console.log('DeepSeek API response data:', JSON.stringify(data, null, 2));
  
  // Calculate estimated cost based on DeepSeek pricing: $0.27/1M input, $1.10/1M output tokens
  const inputTokens = data.usage?.prompt_tokens || 1000;
  const outputTokens = data.usage?.completion_tokens || 500;
  const estimatedCost = (inputTokens * 0.27 / 1000000) + (outputTokens * 1.10 / 1000000);
  
  let content = data.choices[0].message.content;
  console.log('Raw DeepSeek response content:', content);
  
  // Use same JSON parsing logic as OpenAI version
  try {
    let parsed;
    try {
      parsed = JSON.parse(content);
      console.log('Direct parse successful:', parsed);
    } catch (directParseError) {
      console.log('Direct parse failed, attempting extraction...');
      
      let jsonStart = content.indexOf('{"slides"');
      if (jsonStart === -1) {
        jsonStart = content.indexOf('{\n  "slides"');
      }
      if (jsonStart === -1) {
        jsonStart = content.indexOf('{ "slides"');
      }
      if (jsonStart === -1) {
        const slidesIndex = content.indexOf('"slides"');
        if (slidesIndex > -1) {
          for (let i = slidesIndex; i >= 0; i--) {
            if (content[i] === '{') {
              jsonStart = i;
              break;
            }
          }
        }
      }
      
      if (jsonStart === -1) {
        throw new Error('No valid JSON structure found in response');
      }
      
      let braceCount = 0;
      let jsonEnd = jsonStart;
      for (let i = jsonStart; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
      
      content = content.substring(jsonStart, jsonEnd);
      console.log('Cleaned JSON content:', content);
      parsed = JSON.parse(content);
    }
    
    console.log('Parsed DeepSeek response:', parsed);
    
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      console.error('Invalid response structure:', parsed);
      throw new Error(`Invalid response format from DeepSeek. Expected 'slides' array, got: ${typeof parsed.slides}`);
    }
    
    if (parsed.slides.length === 0) {
      throw new Error('DeepSeek returned empty slides array');
    }
    
    // Validate slide structure
    for (let i = 0; i < parsed.slides.length; i++) {
      const slide = parsed.slides[i];
      if (!slide.slideNumber || !slide.content || !slide.altText) {
        console.error(`Invalid slide ${i}:`, slide);
        throw new Error(`Slide ${i} missing required properties`);
      }
    }
    
    return { slides: parsed.slides, estimatedCost };
  } catch (parseError) {
    console.error('JSON Parse error:', parseError);
    console.error('Raw DeepSeek response content:', content);
    throw new Error(`Failed to parse DeepSeek response: ${parseError.message}`);
  }
}

// DeepSeek implementation for post copy generation
async function generatePostCopyWithDeepSeek(article: Article, publicationName: string, deepSeekApiKey: string): Promise<{ postCopy: { caption: string, hashtags: string[] }, estimatedCost: number }> {
  const temporalContext = calculateTemporalContext(article.published_at);
  
  const systemPrompt = `Create Instagram caption for news carousel. Include hook, summary, attribution, hashtags (8-15). Under 2000 chars. Return JSON: {"caption": "text", "hashtags": ["tag1"]}`;

  const userPrompt = `Story: ${article.title}
Content: ${article.body?.substring(0, 400)}
Published: ${temporalContext.publication_date}
Source: ${publicationName}${article.author ? `, by ${article.author}` : ''}
Region: ${article.region || 'Sussex'}

Replace relative dates with absolute dates in brackets.`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepSeekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek post copy API error:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData
      });
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorData}`);
    }

    const data = await response.json();
    const parsedResponse = JSON.parse(data.choices[0].message.content);
    
    // Calculate estimated cost for DeepSeek
    const inputTokens = data.usage?.prompt_tokens || 300;
    const outputTokens = data.usage?.completion_tokens || 200;
    const estimatedCost = (inputTokens * 0.27 / 1000000) + (outputTokens * 1.10 / 1000000);
    
    return {
      postCopy: {
        caption: parsedResponse.caption,
        hashtags: parsedResponse.hashtags || []
      },
      estimatedCost
    };
  } catch (error) {
    console.error('Error generating post copy with DeepSeek:', error);
    return {
      postCopy: {
        caption: `${article.title} 🗞️\n\n${article.body?.substring(0, 200)}...\n\nSummarised from an article in ${publicationName}${article.author ? `, by ${article.author}` : ''}`,
        hashtags: ['LocalNews', 'Sussex', 'Community', 'News']
      },
      estimatedCost: 0
    };
  }
}