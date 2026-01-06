import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { 
  analyzeStoryTone, 
  extractSubjectMatter, 
  buildIllustrativePrompt, 
  buildPhotographicPrompt 
} from '../_shared/prompt-helpers.ts'
import { 
  buildGeminiIllustrativePrompt, 
  buildGeminiPhotographicPrompt 
} from '../_shared/gemini-prompt-builder.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid illustration styles (matches DB enum)
const VALID_ILLUSTRATION_STYLES = ['editorial_illustrative', 'editorial_photographic'] as const
type IllustrationStyle = typeof VALID_ILLUSTRATION_STYLES[number]

function isValidIllustrationStyle(value: unknown): value is IllustrationStyle {
  return typeof value === 'string' && 
    VALID_ILLUSTRATION_STYLES.includes(value as IllustrationStyle)
}

// Zod schema for request validation
const requestSchema = z.object({
  storyId: z.string().uuid(),
  model: z.string().max(100).optional().default('gpt-image-1.5-medium'),
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate request body
    const body = await req.json();
    const validated = requestSchema.safeParse(body);
    
    if (!validated.success) {
      console.error('Validation error:', validated.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request parameters',
          details: validated.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { storyId, model } = validated.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )
    
    // Model configuration mapping
    interface ModelConfig {
      provider: 'openai' | 'lovable-gemini' | 'lovable-gemini-pro' | 'replicate-flux' | 'replicate-flux-pro';
      quality?: 'high' | 'medium' | 'low';
      credits: number;
      cost: number;
      stylePrefix: string;
    }
    
    const modelConfigs: Record<string, ModelConfig> = {
      // OpenAI GPT Image 1.5 (official per-image pricing for 1536x1024)
      // https://platform.openai.com/docs/models/gpt-image-1.5
      'gpt-image-1.5-high': {
        provider: 'openai',
        quality: 'high',
        credits: 8,
        cost: 0.20,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1.5-medium': {
        provider: 'openai',
        quality: 'medium',
        credits: 4,
        cost: 0.05,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1.5-low': {
        provider: 'openai',
        quality: 'low',
        credits: 2,
        cost: 0.013,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gemini-pro-image': {
        provider: 'lovable-gemini-pro',
        credits: 3,
        cost: 0.005,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gemini-image': {
        provider: 'lovable-gemini',
        credits: 1,
        cost: 0.001,
        stylePrefix: 'cinematic and editorial style, '
      },
      'flux-1.1-pro': {
        provider: 'replicate-flux-pro',
        credits: 10,
        cost: 0.04,
        stylePrefix: 'photorealistic editorial photography, '
      },

      // Legacy support for older UI/model keys that map to GPT Image 1
      // (official per-image pricing for 1536x1024)
      // https://platform.openai.com/docs/models/gpt-image-1
      'gpt-image-1-high': {
        provider: 'openai',
        quality: 'high',
        credits: 8,
        cost: 0.25,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1-medium': {
        provider: 'openai',
        quality: 'medium',
        credits: 4,
        cost: 0.063,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1-low': {
        provider: 'openai',
        quality: 'low',
        credits: 2,
        cost: 0.016,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1': {
        provider: 'openai',
        quality: 'medium',
        credits: 4,
        cost: 0.063,
        stylePrefix: 'cinematic and editorial style, '
      },
      'flux-dev': {
        provider: 'replicate-flux',
        credits: 3,
        cost: 0.025,
        stylePrefix: 'cinematic and editorial style, '
      }
    }
    
    const modelConfig = modelConfigs[model] || modelConfigs['gpt-image-1.5-medium']

    if (!storyId) {
      return new Response(
        JSON.stringify({ error: 'Story ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check feature flag for photographic mode
    const { data: featureFlag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', 'illustration_photographic_mode')
      .single()
    
    const photographicModeEnabled = featureFlag?.enabled ?? true

    // Get story details with topic information for illustration_style
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        *,
        article:article_id(topic_id),
        topic_article:topic_article_id(topic_id)
      `)
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Determine topic_id from either architecture
    const topicId = (story as any).article?.topic_id || (story as any).topic_article?.topic_id
    
    // Fetch topic's illustration_style and primary color
    let illustrationStyle: IllustrationStyle = 'editorial_illustrative' // default
    let primaryColor: string = '#10B981' // default mint green
    let topicRegion: string | undefined = undefined // for place-accurate prompts
    
    if (topicId) {
      const { data: topicData } = await supabase
        .from('topics')
        .select('illustration_style, illustration_primary_color, region')
        .eq('id', topicId)
        .single()
      
      if (topicData?.illustration_style) {
        // Validate enum value
        if (isValidIllustrationStyle(topicData.illustration_style)) {
          illustrationStyle = topicData.illustration_style
        } else {
          console.warn(`Invalid illustration_style from DB: ${topicData.illustration_style}, using default`)
        }
      }
      
      // Use topic's primary color if set
      if (topicData?.illustration_primary_color) {
        primaryColor = topicData.illustration_primary_color
        console.log(`Using topic primary color: ${primaryColor}`)
      }
      
      // Capture region for place-accurate image prompts
      if (topicData?.region) {
        topicRegion = topicData.region
        console.log(`Using topic region for place accuracy: ${topicRegion}`)
      }
    }

    // Guard: Photographic style requires feature flag and Replicate API key
    if (illustrationStyle === 'editorial_photographic') {
      if (!photographicModeEnabled) {
        return new Response(
          JSON.stringify({ 
            error: 'Photographic illustration mode is currently disabled. Please use illustrative style or try again later.' 
          }),
          { 
            status: 503, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      if (model === 'flux-1.1-pro' && !Deno.env.get('REPLICATE_API_TOKEN')) {
        return new Response(
          JSON.stringify({ 
            error: 'FLUX photographic generation is not available. Replicate API is not configured.' 
          }),
          { 
            status: 503, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    console.log(`Generating illustration for story ${storyId} with style: ${illustrationStyle}, model: ${model}`)

    // Fetch all slides for the story to analyze full narrative
    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('content, slide_number')
      .eq('story_id', storyId)
      .order('slide_number', { ascending: true })

    if (slidesError) {
      console.error('Error fetching slides:', slidesError)
    }

    // Weight early slides more heavily for illustration - first 3 slides are primary narrative
    const slideContent = slides?.map((s, idx) => {
      const weight = idx < 3 ? '' : '(background context: ';
      const suffix = idx < 3 ? '' : ')';
      return `${weight}${s.content}${suffix}`;
    }).join('\n\n') || '';
    console.log('Fetched slide content for cover generation:', slideContent ? `${slideContent.length} chars` : 'No slides found')

    // Allow regeneration - don't check if illustration already exists
    // This enables the regenerate functionality

    // Helper function to safely convert large images to base64
    const safeBase64Encode = (uint8Array: Uint8Array): string => {
      const chunkSize = 0x8000; // 32KB chunks
      let result = '';
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        result += String.fromCharCode(...chunk);
      }
      
      return btoa(result);
    };

    // Model configuration is now defined at the top of the function (line ~77)

    // Check if user is super admin (bypass credit deduction)
    const { data: hasAdminRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'superadmin'
    })
    
    const isSuperAdmin = hasAdminRole === true
    let creditResult = null
    
    // Track fallback usage to inform the user
    let usedFallback = false
    let fallbackReason = ''
    let fallbackModel = ''

    // Deduct credits based on model - skip for super admin
    if (!isSuperAdmin) {
      const { data: result, error: creditError } = await supabase.rpc('deduct_user_credits', {
        p_user_id: user.id,
        p_credits_amount: modelConfig.credits,
        p_description: `Story illustration generation (${model})`,
        p_story_id: storyId
      })

      creditResult = result

      if (creditError || !creditResult?.success) {
        return new Response(
          JSON.stringify({ 
            error: creditResult?.error || 'Failed to deduct credits',
            credits_required: modelConfig.credits
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    // Analyze story tone and subject matter using shared helpers
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
    
    const storyTone = await analyzeStoryTone(
      slides || [],
      OPENAI_API_KEY
    )
    
    const subjectMatter = await extractSubjectMatter(
      slides || [],
      OPENAI_API_KEY,
      story.title
    )

    // Build appropriate prompt based on illustration style, passing region for place accuracy
    const illustrationPrompt = illustrationStyle === 'editorial_photographic'
      ? buildPhotographicPrompt(storyTone, subjectMatter, story.title, primaryColor, topicRegion)
      : buildIllustrativePrompt(storyTone, subjectMatter, story.title, primaryColor, topicRegion)

    console.log(`Using ${illustrationStyle} style prompt for model ${model}`)
    console.log('Prompt preview:', illustrationPrompt.substring(0, 200) + '...')

    // Define expression instruction based on story tone (used by all providers)
    const expressionInstruction = storyTone === 'serious' 
      ? 'realistic and journalistic depiction'
      : storyTone === 'urgent'
      ? 'dynamic and impactful composition'
      : storyTone === 'positive'
      ? 'optimistic and uplifting visual'
      : storyTone === 'neutral'
      ? 'balanced and informative representation'
      : 'appropriate editorial treatment';

    // Generate image based on selected model
    const startTime = Date.now()
    let imageBase64: string
    let generationTime: number

    if (modelConfig.provider === 'replicate-flux') {
      // FLUX.1-dev via Replicate - Standard quality tier
      console.log('Generating with FLUX.1-dev via Replicate...');
      console.log('🎨 Using FLUX-specific simplified prompt strategy');
      
      // FLUX-specific prompt with quantified constraints and explicit bans
      const fluxPrompt = `MANDATORY STYLE RULES (FLUX MUST FOLLOW):
1. COLORS: Black (#000000) + Primary Accent (${primaryColor}) ONLY - no orange, no gray fills, no other colors
2. ACCENT LIMIT: Apply primary color to EXACTLY 2-3 small objects maximum (one window, one door, one sign) - NOT on multiple storefronts
3. LINE WORK: Thick outer contours ONLY - NO window panes, NO brick texture, NO roof tiles, NO interior architectural detail
4. SHADOWS: Solid black fills ONLY - NO crosshatching, NO halftone dots, NO texture patterns
5. ROADS: Solid white ONLY - NO perspective lines, NO road markings, NO surface texture
6. COMPOSITION: Edge-to-edge with white background - NO text anywhere

SUBJECT: ${subjectMatter}

STORY: "${story.title}"

VISUAL EXECUTION CHECKLIST:
✓ Bold black outlines (2-4px weight) defining building shapes
✓ Solid black shadows under eaves and doorways
✓ 2-3 small accent elements in ${primaryColor} (e.g. one awning, one door, one window box)
✓ Simplified building facades - NO individual bricks, NO window frames, NO decorative molding
✓ Clean white road surface with NO markings
✓ Maximum 20-30 total line strokes for entire composition

TONE: ${storyTone.toUpperCase()} - ${expressionInstruction}

WHAT TO AVOID (CRITICAL):
❌ Multiple green storefronts (causes visual chaos)
❌ Window pane dividers and glass reflections
❌ Brick/tile texture patterns
❌ Perspective construction lines on roads
❌ Interior architectural details (molding, frames, panels)
❌ Any color other than black and mint green (#58FFBC)

Style benchmark: Think flat vector illustration with maximum 30 line strokes total.`;
      
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY not configured');
      }

      // Start generation with FLUX.1-dev (Replicate models endpoint)
      const createResponse = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60'
        },
        body: JSON.stringify({
          input: {
            prompt: fluxPrompt,
            aspect_ratio: '3:2',
            num_outputs: 1,
            num_inference_steps: 28,
            output_format: 'png',
            output_quality: 90,
            go_fast: true
          }
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Replicate creation error:', errorText);
        throw new Error(`Replicate API error: ${createResponse.status}`);
      }

      const prediction = await createResponse.json();
      const predictionId = prediction.id;
      console.log('Replicate prediction started:', predictionId);

      // Poll for completion (max 90 seconds for quality generation)
      let attempts = 0;
      const maxAttempts = 90;
      let finalPrediction;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Token ${REPLICATE_API_KEY}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Replicate status check failed: ${statusResponse.status}`);
        }

        finalPrediction = await statusResponse.json();
        console.log(`Replicate status (attempt ${attempts + 1}):`, finalPrediction.status);

        if (finalPrediction.status === 'succeeded') {
          break;
        } else if (finalPrediction.status === 'failed' || finalPrediction.status === 'canceled') {
          throw new Error(`Replicate generation failed: ${finalPrediction.error || 'Unknown error'}`);
        }

        attempts++;
      }

      if (!finalPrediction || finalPrediction.status !== 'succeeded') {
        throw new Error('Replicate generation timeout - please try again');
      }

      // Get image URL from output
      const imageUrl = finalPrediction.output?.[0];
      if (!imageUrl) {
        throw new Error('No image URL in Replicate response');
      }

      console.log('Fetching generated image from:', imageUrl);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
      }

      const imageBlob = await imageResponse.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      imageBase64 = safeBase64Encode(uint8Array);

    } else if (modelConfig.provider === 'lovable-gemini') {
      // Use Lovable AI Gateway for Gemini image generation - Budget tier
      console.log('Generating with Gemini 2.5 Flash Image via Lovable AI Gateway...');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      // Generate model-specific prompt leveraging Gemini's world knowledge
      const geminiPrompt = illustrationStyle === 'editorial_photographic'
        ? buildGeminiPhotographicPrompt({
            tone: storyTone,
            subject: subjectMatter,
            storyTitle: story.title,
            slideContent: slideContent || subjectMatter,
            publicationName: story.topic?.name,
            primaryColor
          })
        : buildGeminiIllustrativePrompt({
            tone: storyTone,
            subject: subjectMatter,
            storyTitle: story.title,
            slideContent: slideContent || subjectMatter,
            publicationName: story.topic?.name,
            primaryColor
          });

      console.log(`📝 Gemini prompt (${geminiPrompt.length} chars):`, geminiPrompt.substring(0, 200) + '...');

      const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [
            {
              role: 'user',
              content: geminiPrompt
            }
          ],
          modalities: ['image', 'text'],
          response_modalities: ['IMAGE'],
          image_config: {
            aspect_ratio: '3:2'
          }
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('Gemini API error response:', errorText);
        
        if (geminiResponse.status === 429) {
          throw new Error('Gemini rate limit exceeded. Please try again later.');
        } else if (geminiResponse.status === 402) {
          throw new Error('Lovable AI credits exhausted. Please add credits to your workspace.');
        }
        
        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      }

      const geminiData = await geminiResponse.json();
      console.log('📊 Gemini generation metadata:', {
        model: 'google/gemini-2.5-flash-image',
        requestedAspectRatio: '3:2',
        promptLength: geminiPrompt.length,
        estimatedCost: '$0.005',
        creditsUsed: 1
      });
      console.log('Gemini response structure:', JSON.stringify(geminiData, null, 2).substring(0, 1000));

      // Extract image from response with comprehensive error handling
      let base64Data: string | undefined;
      
      console.log('Parsing Gemini response. Available keys:', Object.keys(geminiData));
      
      // Try different response formats (Gemini API changes frequently)
      if (geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        console.log('Found image in choices[0].message.images[0].image_url.url');
        base64Data = geminiData.choices[0].message.images[0].image_url.url;
      } else if (geminiData.choices?.[0]?.message?.content) {
        console.log('Checking choices[0].message.content for base64');
        const content = geminiData.choices[0].message.content;
        if (typeof content === 'string' && content.includes('base64,')) {
          base64Data = content;
        } else if (Array.isArray(content)) {
          // Check if content is an array with image parts
          for (const part of content) {
            if (part?.type === 'image_url' && part?.image_url?.url) {
              base64Data = part.image_url.url;
              break;
            } else if (part?.image_base64) {
              base64Data = `data:image/png;base64,${part.image_base64}`;
              break;
            }
          }
        }
      } else if (geminiData.data?.[0]?.url) {
        console.log('Found image in data[0].url');
        base64Data = geminiData.data[0].url;
      } else if (geminiData.data?.[0]?.b64_json) {
        console.log('Found image in data[0].b64_json');
        base64Data = `data:image/png;base64,${geminiData.data[0].b64_json}`;
      } else if (geminiData.images?.[0]) {
        console.log('Found image in images[0]');
        base64Data = geminiData.images[0];
      }

      if (!base64Data) {
        console.error('Could not find image in Gemini response. Full response:', JSON.stringify(geminiData, null, 2));
        throw new Error('No image data in Gemini response. The API response format may have changed.');
      }

      console.log('Found base64 data, length:', base64Data.length, 'prefix:', base64Data.substring(0, 50));
      
      // Remove data URL prefix if present
      const base64String = base64Data.includes('base64,') 
        ? base64Data.split('base64,')[1] 
        : base64Data;

      console.log('Decoding base64 string of length:', base64String.length);

      // Decode base64 to direct base64 string
      try {
        // Validate base64 before assigning
        atob(base64String); // Test decode
        imageBase64 = base64String;
        console.log('Successfully validated image base64');
      } catch (decodeError) {
        console.error('Failed to decode base64:', decodeError);
        throw new Error('Failed to decode Gemini image data');
      }
    } else if (modelConfig.provider === 'lovable-gemini-pro') {
      // Use Lovable AI Gateway for Gemini 3 Pro image generation with style reference
      console.log('Generating with Gemini 3 Pro Image via Lovable AI Gateway (with style reference)...');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      // Build style reference URL - use a publicly accessible URL for Gemini
      // Gemini requires publicly accessible URLs, not localhost/preview URLs
      // For now, we'll use an enhanced text-only prompt with very detailed style instructions
      // since Gemini's image generation doesn't reliably support style transfer from reference images
      
      console.log(`📸 Using enhanced text-only prompt for style consistency (Gemini image gen limitation)`);
      
      // Flag for style mode - currently text-only with detailed style instructions
      const useEnhancedStylePrompt = illustrationStyle === 'editorial_illustrative';

      // Generate model-specific prompt leveraging Gemini's world knowledge
      const geminiProPrompt = illustrationStyle === 'editorial_photographic'
        ? buildGeminiPhotographicPrompt({
            tone: storyTone,
            subject: subjectMatter,
            storyTitle: story.title,
            slideContent: slideContent || subjectMatter,
            publicationName: story.topic?.name,
            primaryColor
          })
        : buildGeminiIllustrativePrompt({
            tone: storyTone,
            subject: subjectMatter,
            storyTitle: story.title,
            slideContent: slideContent || subjectMatter,
            publicationName: story.topic?.name,
            primaryColor
          });

      // Use text-only prompt (Gemini image gen doesn't reliably support style transfer from reference images)
      console.log(`📝 Gemini Pro prompt (${geminiProPrompt.length} chars) - enhanced style specification`);

      // Make Gemini Pro request
      const geminiProResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-pro-image-preview',
          messages: [
            {
              role: 'user',
              content: geminiProPrompt
            }
          ],
          modalities: ['image', 'text'],
          response_modalities: ['IMAGE'],
          image_config: {
            aspect_ratio: '3:2'
          }
        }),
      });

      if (!geminiProResponse.ok) {
        const errorText = await geminiProResponse.text();
        console.error('Gemini Pro API error response:', errorText);
        
        if (geminiProResponse.status === 429) {
          throw new Error('Gemini Pro rate limit exceeded. Please try again later.');
        } else if (geminiProResponse.status === 402) {
          throw new Error('Lovable AI credits exhausted. Please add credits to your workspace.');
        }
        
        throw new Error(`Gemini Pro API error: ${geminiProResponse.status} - ${errorText}`);
      }
      
      console.log('✅ Gemini Pro request successful');

      const geminiProData = await geminiProResponse.json();
      console.log('📊 Gemini Pro generation metadata:', {
        model: 'google/gemini-3-pro-image-preview',
        requestedAspectRatio: '3:2',
        promptLength: geminiProPrompt.length,
        estimatedCost: '$0.005',
        creditsUsed: 3
      });
      console.log('Gemini Pro response structure:', JSON.stringify(geminiProData, null, 2).substring(0, 1000));

      // Extract image from response with comprehensive error handling
      let base64DataPro: string | undefined;
      
      console.log('Parsing Gemini Pro response. Available keys:', Object.keys(geminiProData));
      
      // Try different response formats
      if (geminiProData.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        console.log('Found image in choices[0].message.images[0].image_url.url');
        base64DataPro = geminiProData.choices[0].message.images[0].image_url.url;
      } else if (geminiProData.choices?.[0]?.message?.content) {
        console.log('Checking choices[0].message.content for base64');
        const content = geminiProData.choices[0].message.content;
        if (typeof content === 'string' && content.includes('base64,')) {
          base64DataPro = content;
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part?.type === 'image_url' && part?.image_url?.url) {
              base64DataPro = part.image_url.url;
              break;
            } else if (part?.image_base64) {
              base64DataPro = `data:image/png;base64,${part.image_base64}`;
              break;
            }
          }
        }
      } else if (geminiProData.data?.[0]?.url) {
        console.log('Found image in data[0].url');
        base64DataPro = geminiProData.data[0].url;
      } else if (geminiProData.data?.[0]?.b64_json) {
        console.log('Found image in data[0].b64_json');
        base64DataPro = `data:image/png;base64,${geminiProData.data[0].b64_json}`;
      } else if (geminiProData.images?.[0]) {
        console.log('Found image in images[0]');
        base64DataPro = geminiProData.images[0];
      }

      if (!base64DataPro) {
        console.error('Could not find image in Gemini Pro response. Full response:', JSON.stringify(geminiProData, null, 2));
        throw new Error('No image data in Gemini Pro response. The API response format may have changed.');
      }

      console.log('Found base64 data, length:', base64DataPro.length, 'prefix:', base64DataPro.substring(0, 50));
      
      // Remove data URL prefix if present
      const base64StringPro = base64DataPro.includes('base64,') 
        ? base64DataPro.split('base64,')[1] 
        : base64DataPro;

      console.log('Decoding base64 string of length:', base64StringPro.length);

      // Decode base64 to direct base64 string
      try {
        atob(base64StringPro); // Test decode
        imageBase64 = base64StringPro;
        console.log('Successfully validated Gemini Pro image base64');
      } catch (decodeError) {
        console.error('Failed to decode base64:', decodeError);
        throw new Error('Failed to decode Gemini Pro image data');
      }
    } else if (modelConfig.provider === 'openai') {
      const openaiModelName = model.startsWith('gpt-image-1.5') ? 'gpt-image-1.5' : 'gpt-image-1';

      console.log(`Generating with OpenAI ${openaiModelName}...`);

      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      console.log('📸 OpenAI request parameters:', {
        model: openaiModelName,
        size: '1536x1024',
        quality: modelConfig.quality || 'medium',
        promptLength: illustrationPrompt.length
      });

      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openaiModelName,
          prompt: illustrationPrompt,
          n: 1,
          size: '1536x1024', // Landscape aspect ratio for feed UI
          quality: modelConfig.quality || 'medium',
          output_format: 'png'
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error response:', errorText);
        console.error('Request parameters:', JSON.stringify({
          model: openaiModelName,
          size: '1536x1024',
          quality: modelConfig.quality || 'medium',
          output_format: 'webp',
          output_compression: compressionLevel
        }));
        
        // Try to parse error details
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
          console.error('Parsed error:', JSON.stringify(errorJson, null, 2));
        } catch {
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
        }

        // Handle moderation blocks with automatic fallback to Gemini
        if (errorJson?.error?.code === 'moderation_blocked') {
          console.warn('⚠️ OpenAI moderation blocked prompt - this appears to be a false positive');
          console.warn('📝 Blocked prompt preview:', illustrationPrompt.substring(0, 300));
          
          // Refund OpenAI credits before falling back
          if (!isSuperAdmin && creditResult) {
            console.log('💰 Refunding credits due to moderation block...');
            await supabase.rpc('add_user_credits', {
              p_user_id: user.id,
              p_credits_amount: modelConfig.credits,
              p_description: `Refund: OpenAI moderation false positive (${model})`,
              p_story_id: storyId
            });
          }
          
          // Automatically fall back to Gemini
          console.log('🔄 Automatically falling back to Gemini image generation...');
          usedFallback = true
          fallbackReason = 'OpenAI content moderation blocked this prompt (likely due to a celebrity name or sensitive topic). Image generated using fallback model.'
          fallbackModel = 'Gemini'
          
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (!LOVABLE_API_KEY) {
            throw new Error('Cannot fallback: LOVABLE_API_KEY not configured');
          }

          // Use Gemini-specific prompt
          const geminiPrompt = illustrationStyle === 'editorial_photographic'
            ? buildGeminiPhotographicPrompt({
                tone: storyTone,
                subject: subjectMatter,
                storyTitle: story.title,
                slideContent: slideContent || subjectMatter,
                publicationName: story.topic?.name,
                primaryColor
              })
            : buildGeminiIllustrativePrompt({
                tone: storyTone,
                subject: subjectMatter,
                storyTitle: story.title,
                slideContent: slideContent || subjectMatter,
                publicationName: story.topic?.name,
                primaryColor
              });

          const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash-image',
              messages: [{
                role: 'user',
                content: geminiPrompt
              }],
              modalities: ['image', 'text'],
              response_modalities: ['IMAGE'],
              image_config: {
                aspect_ratio: '3:2'
              }
            }),
          });

          if (!geminiResponse.ok) {
            const geminiErrorText = await geminiResponse.text();
            console.error('Gemini fallback failed:', geminiErrorText);
            
            // Check if it's a credits issue - try Replicate FLUX as tertiary fallback
            if (geminiResponse.status === 402 || geminiErrorText.includes('Not enough credits')) {
              console.log('🔄 Gemini credits exhausted - trying Replicate FLUX fallback...');
              fallbackModel = 'Replicate FLUX'
              
              const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
              if (!REPLICATE_API_KEY) {
                throw new Error('OpenAI moderation blocked, Gemini credits exhausted, and Replicate not configured. Please add Lovable AI credits or configure REPLICATE_API_KEY.');
              }

              // FLUX-specific prompt (simplified for reliability)
              const fluxFallbackPrompt = `Editorial illustration for news story. Subject: ${subjectMatter}. Story: "${story.title}". Style: Clean editorial illustration with bold black outlines and ${primaryColor} accent color. Tone: ${storyTone}. No text.`;

              const fluxResponse = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
                method: 'POST',
                headers: {
                  'Authorization': `Token ${REPLICATE_API_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'wait=60'
                },
                body: JSON.stringify({
                  input: {
                    prompt: fluxFallbackPrompt,
                    aspect_ratio: '3:2',
                    num_outputs: 1,
                    output_format: 'png',
                    go_fast: true
                  }
                }),
              });

              if (!fluxResponse.ok) {
                const fluxErrorText = await fluxResponse.text();
                console.error('Replicate FLUX fallback also failed:', fluxErrorText);
                throw new Error('All image generation providers failed. Please try again later or contact support.');
              }

              const fluxPrediction = await fluxResponse.json();
              const fluxPredictionId = fluxPrediction.id;
              console.log('Replicate FLUX fallback prediction started:', fluxPredictionId);

              // Poll for completion (max 60 seconds)
              let fluxAttempts = 0;
              const fluxMaxAttempts = 60;
              let finalFluxPrediction;

              while (fluxAttempts < fluxMaxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${fluxPredictionId}`, {
                  headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
                });

                if (!statusResponse.ok) {
                  throw new Error(`Replicate status check failed: ${statusResponse.status}`);
                }

                finalFluxPrediction = await statusResponse.json();
                console.log(`Replicate FLUX status (attempt ${fluxAttempts + 1}):`, finalFluxPrediction.status);

                if (finalFluxPrediction.status === 'succeeded') break;
                if (finalFluxPrediction.status === 'failed' || finalFluxPrediction.status === 'canceled') {
                  throw new Error(`Replicate FLUX generation failed: ${finalFluxPrediction.error || 'Unknown error'}`);
                }

                fluxAttempts++;
              }

              if (!finalFluxPrediction || finalFluxPrediction.status !== 'succeeded') {
                throw new Error('Replicate FLUX generation timeout');
              }

              const fluxImageUrl = finalFluxPrediction.output?.[0];
              if (!fluxImageUrl) {
                throw new Error('No image URL in Replicate FLUX response');
              }

              console.log('Fetching FLUX fallback image from:', fluxImageUrl);
              const fluxImageResponse = await fetch(fluxImageUrl);
              if (!fluxImageResponse.ok) {
                throw new Error(`Failed to fetch FLUX image: ${fluxImageResponse.status}`);
              }

              const fluxImageBlob = await fluxImageResponse.blob();
              const fluxArrayBuffer = await fluxImageBlob.arrayBuffer();
              const fluxUint8Array = new Uint8Array(fluxArrayBuffer);
              imageBase64 = safeBase64Encode(fluxUint8Array);
              
              console.log('✅ Successfully generated image using Replicate FLUX fallback');
            } else {
              throw new Error(`OpenAI moderation blocked and Gemini fallback failed: ${geminiErrorText}`);
            }
          } else {
            const geminiData = await geminiResponse.json();
            const base64Data = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            
            if (!base64Data || !base64Data.includes('base64,')) {
              throw new Error('No valid image data in Gemini fallback response');
            }

            const base64String = base64Data.split('base64,')[1];
            imageBase64 = base64String;
            
            console.log('✅ Successfully generated image using Gemini fallback');
          }
          
        } else {
          // Other OpenAI errors
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorJson.error?.message || errorText}`);
        }
      } else {
        // Success path - parse response
        const openaiData = await openaiResponse.json();
        console.log('OpenAI response received');

        // GPT-Image-1 returns base64 by default
        const base64Data = openaiData.data?.[0]?.b64_json;
        if (!base64Data) {
          throw new Error('No image data in OpenAI response');
        }

        imageBase64 = base64Data;
      }

    } else if (modelConfig.provider === 'replicate-flux-pro') {
      // FLUX 1.1 Pro via Replicate - Premium photographic tier
      console.log('Generating with FLUX 1.1 Pro via Replicate...');
      
      const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
      if (!REPLICATE_API_TOKEN) {
        throw new Error('REPLICATE_API_TOKEN not configured');
      }

      // Start prediction with 30s timeout
      const predictionTimeout = 30000 // 30 seconds max
      const predictionStartTime = Date.now()

      const predictionResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-1.1-pro', // FLUX 1.1 Pro model
          input: {
            prompt: illustrationPrompt,
            aspect_ratio: '3:2', // Landscape photojournalism standard
            output_format: 'webp',
            output_quality: 90,
            safety_tolerance: 2, // Allow editorial news content
          },
        }),
      });

      if (!predictionResponse.ok) {
        const errorText = await predictionResponse.text();
        console.error('FLUX 1.1 Pro API error response:', errorText);
        
        // Classify errors for better user feedback
        if (predictionResponse.status === 429) {
          throw new Error('Replicate rate limit exceeded. Please try again in a few moments.');
        } else if (predictionResponse.status === 401) {
          throw new Error('Replicate authentication failed. API token may be invalid.');
        } else if (predictionResponse.status === 503) {
          throw new Error('FLUX service temporarily unavailable. Please try again later.');
        }
        
        throw new Error(`FLUX 1.1 Pro API error: ${predictionResponse.status} - ${errorText}`);
      }

      const prediction = await predictionResponse.json();
      const predictionId = prediction.id;
      
      console.log(`FLUX 1.1 Pro prediction started: ${predictionId}`);
      
      // Log prediction ID for debugging
      try {
        await supabase
          .from('system_logs')
          .insert({
            level: 'info',
            message: 'FLUX 1.1 Pro generation started',
            context: {
              story_id: storyId,
              prediction_id: predictionId,
              model: 'flux-1.1-pro',
              illustration_style: illustrationStyle
            },
            function_name: 'story-illustrator'
          });
      } catch (logError) {
        console.warn('Failed to log prediction start (non-critical):', logError);
      }

      // Poll for completion with timeout
      let fluxResult = prediction;
      while (fluxResult.status !== 'succeeded' && fluxResult.status !== 'failed') {
        if (Date.now() - predictionStartTime > predictionTimeout) {
          throw new Error('FLUX generation timed out after 30 seconds. Please try again.');
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1 second
        
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check FLUX generation status: ${statusResponse.status}`);
        }

        fluxResult = await statusResponse.json();
        console.log(`FLUX status: ${fluxResult.status}`);
      }

      if (fluxResult.status === 'failed') {
        console.error('FLUX generation failed:', fluxResult.error);
        throw new Error(`FLUX generation failed: ${fluxResult.error || 'Unknown error'}`);
      }

      // Get the generated image URL (output can be string or array)
      const fluxImageUrl = Array.isArray(fluxResult.output) 
        ? fluxResult.output[0] 
        : fluxResult.output;
      
      if (!fluxImageUrl) {
        throw new Error('No image URL in FLUX response');
      }

      console.log('Downloading FLUX image from:', fluxImageUrl);

      // Download the image
      const imageResponse = await fetch(fluxImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download FLUX image: ${imageResponse.status}`);
      }

      const imageArrayBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imageArrayBuffer);
      
      // Convert to base64
      imageBase64 = safeBase64Encode(uint8Array);
      console.log('FLUX image downloaded and converted to base64');

    } else {
      throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }

    generationTime = Date.now() - startTime
    
    // Calculate actual cost based on provider actually used (handles fallbacks)
    let actualServiceName: string = modelConfig.provider;
    let actualCostUsd: number = modelConfig.cost;

    if (usedFallback) {
      if (fallbackModel === 'Gemini') {
        actualServiceName = 'lovable-gemini';
        actualCostUsd = modelConfigs['gemini-image']?.cost ?? 0.001;
      } else if (fallbackModel === 'Replicate FLUX') {
        actualServiceName = 'replicate-flux';
        actualCostUsd = modelConfigs['flux-dev']?.cost ?? 0.025;
      }
    }

    // Track API usage (table has no metadata column)
    try {
      const { error: usageError } = await supabase
        .from('api_usage')
        .insert({
          service_name: actualServiceName,
          operation: 'image_generation',
          cost_usd: actualCostUsd,
          tokens_used: 0,
          region: null,
        })

      if (usageError) {
        console.error('Failed to log API usage (this is non-critical):', usageError)
      }
    } catch (error) {
      console.error('API usage logging failed (this is non-critical):', error)
    }

    // Upload to Supabase Storage
    const fileName = `story-${storyId}-${Date.now()}.png`
    
    // Validate base64 data before processing
    if (!imageBase64) {
      throw new Error('No image data to upload')
    }
    
    try {
      // Convert base64 to Uint8Array with error handling
      const binaryString = atob(imageBase64)
      const uint8Array = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i)
      }
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('visuals')
        .upload(fileName, uint8Array, {
          contentType: 'image/png',
          upsert: false
        })
      
      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`)
      }
    } catch (decodeError) {
      console.error('Base64 decode error:', decodeError)
      throw new Error(`Failed to process image data: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`)
    }

    const imageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/visuals/${fileName}`

    // Update story with illustration (clearing any existing animation)
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        cover_illustration_url: imageUrl,
        cover_illustration_prompt: illustrationPrompt,
        illustration_generated_at: new Date().toISOString(),
        animated_illustration_url: null  // Clear animation when new static image is generated
      })
      .eq('id', storyId)

    if (updateError) {
      throw new Error(`Update error: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        illustration_url: imageUrl,
        model: model,
        credits_used: isSuperAdmin ? 0 : modelConfig.credits,
        new_balance: creditResult?.new_balance || null,
        used_fallback: usedFallback,
        fallback_reason: usedFallback ? fallbackReason : undefined,
        fallback_model: usedFallback ? fallbackModel : undefined
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Story illustrator error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})