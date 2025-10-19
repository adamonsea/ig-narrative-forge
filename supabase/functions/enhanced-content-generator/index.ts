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

const toneGuidance: Record<string, string> = {
  formal: 'Use precise, objective language with strong sourcing and avoid colloquialisms.',
  conversational: 'Use approachable, plain-language explanations that still respect the facts.',
  engaging: 'Use vivid, energetic language while keeping statements grounded in verified facts.'
};

const writingStyleGuidance: Record<string, string> = {
  journalistic: 'Follow the inverted pyramid: lead with the verified headline fact, then key supporting context, and close with impact.',
  educational: 'Teach the reader progressively. Break complex developments into clear, explanatory steps tied to the evidence.',
  listicle: 'Structure each slide around a crisp, scannable takeaway that derives directly from the article.',
  story_driven: 'Lean into narrative pacing with setup, escalation, and resolution while grounding every beat in reported facts.'
};

const expertiseGuidance: Record<string, string> = {
  beginner: 'Assume no prior knowledge—define specialised terms and spell out why each fact matters locally.',
  intermediate: 'Assume general awareness—move quickly to implications while clarifying any advanced terminology.',
  expert: 'Assume deep familiarity—focus on nuanced analysis, data points, and downstream impact without rehashing basics.'
};

const getGuidance = (map: Record<string, string>, key: string, fallback: string) => map[key] || fallback;

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

    const systemPrompts = templates?.filter((t: any) => t.category === 'system') || [];
    const contentPrompts = templates?.filter((t: any) => t.category === 'content') || [];

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
    writingStyle: string,
    expertise: string, 
    slideType: string,
    slideCount: number,
    publicationName: string,
    templateGuidance?: string
  ): Promise<SlideContent[]> {
    try {
      const prompt = `Create engaging web feed carousel slides for this ${slideType} story.

ARTICLE DETAILS:
Title: ${article.title}
Content: ${article.body}
Publication: ${publicationName}
Author: ${article.author || 'Staff Reporter'}

REQUIREMENTS:
- Tone guidance: ${getGuidance(toneGuidance, tone, `Maintain a consistent ${tone} tone.`)}
- Writing style: ${getGuidance(writingStyleGuidance, writingStyle, `Match the ${writingStyle} style.`)}
- Audience expertise: ${getGuidance(expertiseGuidance, expertise, `Write for a ${expertise} reader.`)}
- Create exactly ${slideCount} slides (${slideType}: 4=short, 6=tabloid, 8=indepth, 12=extensive)
- CRITICAL WORD LIMITS: Slide 1 (headline) MUST be 8 words ideal, 15 words maximum, all other slides MUST be maximum 30-40 words each. This is non-negotiable.
- Include visual prompts for each slide
- Make it shareable and engaging for web readers
- Include alt text for accessibility
- Final slide should include source attribution
- CTAs should be web-appropriate (e.g., "share with friends", "discuss with others", "read more", "explore further")
- Avoid social media specific language like "tag", "follow", or platform-specific terms

${templateGuidance ? `TEMPLATE DIRECTIVES:\n${templateGuidance}` : ''}

FACT vs OPINION HANDLING:
- FACTUAL STATEMENTS: Present verifiable actions, events, dates, locations without attribution (e.g., "Planning meeting scheduled for Tuesday")
- OPINIONS/CLAIMS: ALWAYS attribute to speaker using "says", "claims", "according to" (e.g., "Councillor Smith says it will boost tourism")
- PARAPHRASED OPINIONS: Use attribution without quotes (e.g., "The mayor claims the policy will reduce traffic")
- DIRECT QUOTES: Use attribution with quotation marks (e.g., 'Mayor calls it "a game-changer for residents"')
- NEVER present subjective claims, predictions, or opinions as if they are established facts

ACCURACY SAFEGUARDS:
- Only use information that appears in the ARTICLE DETAILS section—never invent facts, figures, quotes, or outcomes.
- If the source text lacks a required detail, state "Not specified in source" instead of speculating.
- Flag any contradictions or uncertainties explicitly rather than smoothing them over.

ATTRIBUTION REQUIREMENTS:
- Any statement involving judgment, evaluation, or prediction MUST be attributed
- Use specific titles and names when available (e.g., "Councillor Sarah Brown says" not "officials say")
- Avoid presenting causation claims as facts unless explicitly proven in the article
- When uncertain if something is fact or opinion, err on the side of attribution

SLIDE 1 REQUIREMENTS (FIRST SLIDE ONLY - THE HEADLINE):
- Extract the single most compelling TRUE fact/angle from the article content
- IDEAL: 8 words, MAXIMUM: 15 words, single sentence
- Focus on what makes this genuinely matter to local readers
- Use the strongest claim that the article content fully supports
- Prioritize: local impact > surprising facts > genuine consequences > human interest
- When formal: Lead with authoritative findings ("Council reveals...", "Data shows...")  
- When conversational: Lead with local relevance ("Local residents face...", "New changes mean...")
- NEVER oversell - the content must fully deliver on the hook's promise
- Test: "Does this accurately represent the most important aspect of this story?"

OUTPUT FORMAT (JSON):
{
  "slides": [
    {
      "slideNumber": 1,
      "content": "Extract most compelling TRUE local angle (IDEAL: 8 words, MAX: 15 words, single sentence)",
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
              content: `You are an expert content creator specializing in ${slideType} web feed carousels. Create engaging, ${tone} content using a ${writingStyle} structure that is appropriate for ${expertise} audiences. Maintain strict journalistic accuracy and never fabricate information. Focus on web-appropriate sharing language and avoid social media platform-specific terms.`
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

  async function generatePostCopyWithDeepSeek(
    article: Article, 
    slides: SlideContent[], 
    apiKey: string, 
    publicationName: string
  ): Promise<{ caption: string; hashtags: string[] }> {
    const prompt = `Create engaging web content copy for this news carousel about: ${article.title}

SLIDES PREVIEW:
${slides.map((slide, i) => `Slide ${i + 1}: ${slide.content.substring(0, 100)}...`).join('\n')}

Create:
1. An engaging caption for web readers (max 2200 characters)
2. Relevant hashtags for web sharing (10-15 hashtags)

Make it engaging and shareable for ${publicationName} web readers.
Use web-appropriate language like "share with friends", "discuss this story", "read more".
Avoid social media platform-specific terms.

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
              content: 'You are a web content expert. Create engaging captions and hashtags appropriate for web feed sharing.'
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

  try {
    const { 
      articleId, 
      topicArticleId,
      sharedContentId,
      slideType = 'tabloid', 
      aiProvider = 'deepseek',
      tone = 'conversational',
      writingStyle = 'journalistic',
      audienceExpertise = 'intermediate'
    } = await req.json();
    
    // Log multi-tenant context
    const isMultiTenant = !!(topicArticleId || sharedContentId);
    console.log(`Processing ${isMultiTenant ? 'multi-tenant' : 'legacy'} article. ArticleId: ${articleId}, TopicArticleId: ${topicArticleId}, SharedContentId: ${sharedContentId}`);
    console.log(`AI provider: ${aiProvider}, tone: ${tone}, style: ${writingStyle}, expertise: ${audienceExpertise}`);

    // Get article data - prioritize shared content for multi-tenant
    let article: Article;
    let actualContentSource = 'legacy';
    
    if (isMultiTenant && sharedContentId) {
      console.log('🔄 Fetching content from shared_article_content (multi-tenant)');
      
      // Get shared content and topic article data
      const [sharedContentResult, topicArticleResult] = await Promise.all([
        supabase
          .from('shared_article_content')
          .select('*')
          .eq('id', sharedContentId)
          .single(),
        topicArticleId ? supabase
          .from('topic_articles')
          .select('*')
          .eq('id', topicArticleId)
          .single() : { data: null, error: null }
      ]);

      if (sharedContentResult.error || !sharedContentResult.data) {
        throw new Error(`Shared content not found: ${sharedContentId}`);
      }

      const sharedContent = sharedContentResult.data;
      const topicArticle = topicArticleResult.data;
      
      // Map shared content to Article interface
      article = {
        id: articleId || `bridge-${topicArticleId}`,
        title: sharedContent.title,
        body: sharedContent.body || '',
        author: sharedContent.author,
        published_at: sharedContent.published_at,
        source_url: sharedContent.url,
        image_url: sharedContent.image_url,
        canonical_url: sharedContent.canonical_url,
        word_count: sharedContent.word_count || 0,
        regional_relevance_score: topicArticle?.regional_relevance_score || 0,
        content_quality_score: topicArticle?.content_quality_score || 0,
        processing_status: topicArticle?.processing_status || 'new',
        import_metadata: topicArticle?.import_metadata || {},
        topic_id: topicArticle?.topic_id
      };
      actualContentSource = 'shared';
      console.log(`✅ Using shared content: ${article.title} (${article.word_count} words)`);
    } else {
      console.log('🔄 Fetching content from articles table (legacy)');
      const { data: legacyArticle, error: articleError } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (articleError || !legacyArticle) {
        throw new Error(`Legacy article not found: ${articleId}`);
      }

      article = legacyArticle;
      actualContentSource = 'legacy';
      console.log(`✅ Using legacy article: ${article.title} (${article.word_count} words)`);
    }

    // Get topic details for audience expertise and default tone if available
    let topicExpertise = audienceExpertise;
    let effectiveTone = tone;
    let effectiveWritingStyle = writingStyle;
    
    if (article.topic_id) {
      const { data: topicData } = await supabase
        .from('topics')
        .select('audience_expertise, default_tone, default_writing_style')
        .eq('id', article.topic_id)
        .maybeSingle();
      
      if (topicData) {
        topicExpertise = topicData.audience_expertise || audienceExpertise;
        effectiveTone = topicData.default_tone || tone;
        effectiveWritingStyle = topicData.default_writing_style || writingStyle;
        console.log(`Using topic defaults: expertise=${topicExpertise}, tone=${effectiveTone}, style=${effectiveWritingStyle}`);
      }
    }

    // Build enhanced prompt system
    const promptSystem = await buildPromptSystem(supabase, effectiveTone, topicExpertise, slideType);
    const templateGuidance = [
      ...(promptSystem?.systemPrompts || []).map((prompt: PromptTemplate) => prompt.prompt_content?.trim()).filter(Boolean),
      ...(promptSystem?.contentPrompts || []).map((prompt: PromptTemplate) => prompt.prompt_content?.trim()).filter(Boolean)
    ].join('\n\n');
    
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

    // Snippet handling logic
    const isSnippet = article.word_count > 0 && article.word_count < 150;
    let finalSlideType = slideType;
    
    if (isSnippet) {
      console.log(`🔍 Snippet detected (${article.word_count} words), forcing slideType to 'short'`);
      finalSlideType = 'short';
    }

    // Create slides with correct slide count mapping
    const slideTypeMapping = {
      'short': 4,
      'tabloid': 6, 
      'indepth': 8,
      'extensive': 12
    };
    
    const targetSlideCount = slideTypeMapping[finalSlideType as keyof typeof slideTypeMapping] || 6;
    
    // Generate slides with DeepSeek only
    let slides: SlideContent[];
    const actualProvider = 'deepseek';

    try {
      if (!deepseekApiKey) {
        throw new Error('DeepSeek API key not configured');
      }
      
      console.log('🤖 Using DeepSeek for slide generation...');
      slides = await generateSlidesWithDeepSeek(
        article,
        deepseekApiKey,
        effectiveTone,
        effectiveWritingStyle,
        topicExpertise,
        finalSlideType,
        targetSlideCount,
        publicationName,
        templateGuidance
      );

      console.log(`✅ Generated ${slides.length} slides successfully from ${actualContentSource} source${isSnippet ? ' (snippet)' : ''}`);
    } catch (error) {
      console.error('❌ Error during slide generation:', error);
      
      // For very short content, provide specific error handling
      if (isSnippet && article.body && article.body.length < 50) {
        throw new Error(`Content too short for generation: ${article.body.length} characters. Please expand the content or try manual editing.`);
      }
      
      throw error;
    }

    // Generate post copy with DeepSeek
    let postCopy: { caption: string; hashtags: string[] };
    
    try {
      if (!deepseekApiKey) {
        throw new Error('DeepSeek API key not configured');
      }
      
      console.log('📱 Generating post copy with DeepSeek...');
      postCopy = await generatePostCopyWithDeepSeek(article, slides, deepseekApiKey, publicationName);
      console.log(`✅ Generated post copy: ${postCopy.caption.length} characters, ${postCopy.hashtags.length} hashtags`);
    } catch (error) {
      console.error('❌ Error generating post copy:', error);
      postCopy = {
        caption: `Check out this story about ${article.title}`,
        hashtags: ['news', 'update', 'story']
      };
    }

    // Store or update the story idempotently with multi-tenant support
    let storyId: string | null = null;

    // Try to find existing story for this article (check both article_id and topic_article_id)
    let existingStory: any = null;
    
    if (isMultiTenant && topicArticleId) {
      // Multi-tenant: check by topic_article_id first
      const { data: multiTenantStory, error: mtError } = await supabase
        .from('stories')
        .select('id,status,article_id')
        .eq('topic_article_id', topicArticleId)
        .maybeSingle();
      
      if (mtError) {
        console.warn('⚠️ Error checking existing multi-tenant story:', mtError);
      } else if (multiTenantStory) {
        existingStory = multiTenantStory;
        console.log(`🔍 Found existing multi-tenant story ${multiTenantStory.id}`);
      }
    }
    
    // If no multi-tenant story found and we have articleId, check legacy
    if (!existingStory && articleId) {
      const { data: legacyStory, error: legacyError } = await supabase
        .from('stories')
        .select('id,status,topic_article_id')
        .eq('article_id', articleId)
        .maybeSingle();
      
      if (legacyError) {
        console.warn('⚠️ Error checking existing legacy story:', legacyError);
      } else if (legacyStory) {
        existingStory = legacyStory;
        console.log(`🔍 Found existing legacy story ${legacyStory.id}`);
      }
    }

    if (existingStory?.id) {
      storyId = existingStory.id;
      
      // Update story with multi-tenant linkage and auto-publish
      const updateData: any = { 
        title: article.title,
        status: 'published', // Auto-publish updated stories
        is_published: true, // Auto-publish updated stories
        updated_at: new Date().toISOString()
      };
      
      // Set multi-tenant fields if this is a multi-tenant context
      if (isMultiTenant) {
        if (topicArticleId && !existingStory.topic_article_id) {
          updateData.topic_article_id = topicArticleId;
          console.log(`🔗 Linking existing story to topic_article_id: ${topicArticleId}`);
        }
        if (sharedContentId) {
          updateData.shared_content_id = sharedContentId;
          console.log(`🔗 Linking existing story to shared_content_id: ${sharedContentId}`);
        }
      }
      
      const { error: updateStoryError } = await supabase
        .from('stories')
        .update(updateData)
        .eq('id', storyId);
        
      if (updateStoryError) {
        console.warn('⚠️ Failed to update existing story metadata:', updateStoryError);
      } else {
        console.log(`📝 Updated existing story ${storyId} with multi-tenant linkage`);
      }
    } else {
      // Create new story with full multi-tenant support (auto-published)
      const insertData: any = {
        title: article.title,
        status: 'published', // Auto-publish new stories
        is_published: true, // Auto-publish new stories
        tone: effectiveTone,
        audience_expertise: topicExpertise
      };
      
      // Set appropriate IDs based on context - mutually exclusive
      if (isMultiTenant) {
        // Multi-tenant: use topic_article_id + shared_content_id
        if (topicArticleId) {
          insertData.topic_article_id = topicArticleId;
        }
        if (sharedContentId) {
          insertData.shared_content_id = sharedContentId;
        }
        console.log(`📖 Creating new multi-tenant story with topic_article_id: ${topicArticleId}, shared_content_id: ${sharedContentId}`);
      } else {
        // Legacy: use article_id only
        if (articleId) {
          insertData.article_id = articleId;
        }
        console.log(`📖 Creating new legacy story with article_id: ${articleId}`);
      }

      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert(insertData)
        .select('id')
        .single();

      if (storyError || !newStory) {
        throw new Error(`Failed to create story: ${storyError?.message || 'unknown error'}`);
      }
      storyId = newStory.id;
      console.log(`📖 Created ${isMultiTenant ? 'multi-tenant' : 'legacy'} story with ID: ${storyId}`);
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
        post_copy: postCopy,
        content_source: actualContentSource,
        is_snippet: isSnippet,
        final_slide_type: finalSlideType,
        multi_tenant: isMultiTenant,
        topic_article_id: topicArticleId,
        shared_content_id: sharedContentId
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