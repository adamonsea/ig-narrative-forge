import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  analyzeStoryTone, 
  extractSubjectMatter, 
  buildIllustrativePrompt, 
  buildPhotographicPrompt 
} from '../_shared/prompt-helpers.ts'

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { storyId, model = 'gpt-image-1-medium' } = await req.json()
    
    // Model configuration mapping
    interface ModelConfig {
      provider: 'openai' | 'lovable-gemini' | 'replicate-flux' | 'replicate-flux-pro';
      quality?: 'high' | 'medium' | 'low';
      credits: number;
      cost: number;
      stylePrefix: string;
    }
    
    const modelConfigs: Record<string, ModelConfig> = {
      'gpt-image-1-high': {
        provider: 'openai',
        quality: 'high',
        credits: 10,
        cost: 0.04,
        stylePrefix: 'cinematic and editorial style, '
      },
      'gpt-image-1-medium': {
        provider: 'openai',
        quality: 'medium',
        credits: 5,
        cost: 0.02,
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
      // Legacy support
      'gpt-image-1': {
        provider: 'openai',
        quality: 'medium',
        credits: 5,
        cost: 0.02,
        stylePrefix: 'cinematic and editorial style, '
      },
      'flux-dev': {
        provider: 'replicate-flux',
        credits: 3,
        cost: 0.025,
        stylePrefix: 'cinematic and editorial style, '
      }
    }
    
    const modelConfig = modelConfigs[model] || modelConfigs['gpt-image-1-medium']

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
    
    // Fetch topic's illustration_style
    let illustrationStyle: IllustrationStyle = 'editorial_illustrative' // default
    
    if (topicId) {
      const { data: topicData } = await supabase
        .from('topics')
        .select('illustration_style')
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
      OPENAI_API_KEY
    )

    // Build appropriate prompt based on illustration style
    const illustrationPrompt = illustrationStyle === 'editorial_photographic'
      ? buildPhotographicPrompt(storyTone, subjectMatter, story.title)
      : buildIllustrativePrompt(storyTone, subjectMatter, story.title)

    console.log(`Using ${illustrationStyle} style prompt for model ${model}`)
    console.log('Prompt preview:', illustrationPrompt.substring(0, 200) + '...')

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
1. COLORS: Black (#000000) + Mint Green (#58FFBC) ONLY - no orange, no gray fills, no other colors
2. GREEN LIMIT: Apply mint green to EXACTLY 2-3 small objects maximum (one window, one door, one sign) - NOT on multiple storefronts
3. LINE WORK: Thick outer contours ONLY - NO window panes, NO brick texture, NO roof tiles, NO interior architectural detail
4. SHADOWS: Solid black fills ONLY - NO crosshatching, NO halftone dots, NO texture patterns
5. ROADS: Solid white ONLY - NO perspective lines, NO road markings, NO surface texture
6. COMPOSITION: Edge-to-edge with white background - NO text anywhere

SUBJECT: ${subjectMatter}

STORY: "${story.title}"

VISUAL EXECUTION CHECKLIST:
✓ Bold black outlines (2-4px weight) defining building shapes
✓ Solid black shadows under eaves and doorways
✓ 2-3 small mint green accent elements (e.g. one awning, one door, one window box)
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

      // Create structured Gemini prompt with critical rules first
      const geminiPrompt = `🔴 ADULT AUDIENCE ONLY - PROFESSIONAL EDITORIAL ILLUSTRATION FOR NEWS PUBLICATION 🔴

This illustration will be published in a serious news outlet read by adults (similar to The Guardian, Financial Times, New Yorker, BBC News, Washington Post). Your output will be judged by professional editors.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE REQUIREMENTS (FAILURE = REJECTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADULT EDITORIAL STYLE ONLY - NO CARTOON, NO CHILDREN'S BOOK, NO PLAYFUL
   ❌ REJECT: Rounded cute faces, big eyes, simplified children's book style
   ✅ REQUIRE: Sophisticated editorial illustration with mature visual language
   
2. ABSOLUTELY NO TEXT - Zero tolerance for any written language
   ❌ Speech bubbles, thought bubbles, signs with words, labels, captions
   ✅ Pure visual storytelling only

3. MINT GREEN ACCENT RULE - STRICT PLACEMENT
   ✅ ONLY: 2-3 small (#58FFBC) spots on BACKGROUND objects (signs, equipment, windows, furniture)
   ❌ NEVER: On people's clothing, skin, hair, or bodies
   ⚠️  PENALTY: Green on people = instant rejection and wasted generation

4. EDGE-TO-EDGE COMPOSITION - No amateur framing
   ❌ White borders, padding, margins around image
   ✅ Subject extends to all four edges of canvas

5. PROFESSIONAL LINE WORK - NOT comic book style
   ✅ Varying line weights (thick and thin), sophisticated editorial pen work
   ❌ Uniform lines, decorative crosshatching, dense shading patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL STYLE MANDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TARGET AESTHETIC: Editorial illustration for serious journalism (NOT entertainment, NOT children's content)

DRAWING TECHNIQUE:
• Bold black ink outline with sophisticated line weight variation
• Solid black fills for deepest shadows (strategic placement)
• MINIMAL texture: If needed, use sparse fine dots (10-20 dots max per area)
• Clean negative space with confident white areas
• Adult faces with mature proportions and expressions

COLOR PALETTE:
• Predominantly black line work on white
• EXACTLY 2-3 small mint green (#58FFBC) accent shapes
• Green placement: Background elements ONLY (never on humans)
• Think: Street signs, equipment panels, window frames, architectural details

FORBIDDEN STYLES (These will cause rejection):
❌ Cartoon/animated character style
❌ Children's book illustration aesthetic
❌ Comic strip/manga style
❌ Playful/whimsical character design
❌ Oversimplified cute faces
❌ Heavy decorative patterns
❌ Photorealism attempts

REQUIRED AESTHETIC:
✅ Guardian/New Yorker editorial illustration
✅ Sophisticated pen and ink editorial work
✅ Adult news publication visual language
✅ Professional poster design aesthetic
✅ Mature visual storytelling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STORY: "${story.title}"
EDITORIAL TONE: ${storyTone.toUpperCase()}
EXPRESSION: ${expressionInstruction}

SUBJECT TO ILLUSTRATE:
${subjectMatter}

COMPOSITION REQUIREMENTS:
• Edge-to-edge illustration (no white borders/padding)
• Strong focal point with clear visual hierarchy
• Sophisticated use of negative space
• Professional editorial framing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE REFERENCES FOR YOUR INTERNAL GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Think: The Guardian editorial illustrations, Financial Times weekend illustrations, New Yorker spot illustrations, BBC News graphics, Washington Post opinion page illustrations.

NOT: Disney, Pixar, children's books, comic strips, manga, animation style.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL QUALITY CHECK BEFORE GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before you generate, confirm:
✅ This looks like it belongs in The Guardian, not a children's book
✅ Zero text/words anywhere in the image
✅ Mint green ONLY on background objects (NOT on people)
✅ Edge-to-edge composition (no white borders)
✅ Sophisticated adult editorial aesthetic
✅ Professional line work with varying weights

⚠️  CRITICAL REMINDER: Any cartoon/childish style = wasted generation and unhappy editors
⚠️  GREEN ON PEOPLE = Instant rejection and credit waste`;

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
    } else if (modelConfig.provider === 'openai') {
      // OpenAI GPT-Image-1 - Premium quality tier
      console.log('Generating with OpenAI GPT-Image-1...');
      
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: illustrationPrompt,
          n: 1,
          size: '1536x1024', // Landscape aspect ratio for feed UI
          quality: modelConfig.quality || 'medium', // Medium balances quality and cost
          output_format: 'webp', // Smaller file size
          output_compression: 70 // Reduced for smaller files while maintaining quality
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error response:', errorText);
        console.error('Request parameters:', JSON.stringify({
          model: 'gpt-image-1',
          size: '1536x1024',
          quality: modelConfig.quality,
          output_format: 'webp',
          output_compression: 70
        }));
        
        // Try to parse error details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Parsed error:', JSON.stringify(errorJson, null, 2));
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorJson.error?.message || errorText}`);
        } catch {
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
        }
      }

      const openaiData = await openaiResponse.json();
      console.log('OpenAI response received');

      // GPT-Image-1 returns base64 by default
      const base64Data = openaiData.data?.[0]?.b64_json;
      if (!base64Data) {
        throw new Error('No image data in OpenAI response');
      }

      imageBase64 = base64Data;

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

      // Get the generated image URL
      const fluxImageUrl = fluxResult.output?.[0];
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
    
    // Calculate actual cost based on model configuration
    const estimatedCost = modelConfig.cost;

    // Track API usage with enhanced metadata for debugging
    try {
      const { error: usageError } = await supabase
        .from('api_usage')
        .insert({
          service_name: modelConfig.provider,
          operation: 'image_generation',
          cost_usd: estimatedCost,
          tokens_used: 0,
          region: null,
          metadata: {
            model: model,
            illustration_style: illustrationStyle,
            story_id: storyId,
            generation_time_ms: generationTime,
            prompt_preview: illustrationPrompt.substring(0, 500) // Store prompt for QA
          }
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
        new_balance: creditResult?.new_balance || null
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