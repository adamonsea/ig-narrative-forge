import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { storyId, model = 'gpt-image-1' } = await req.json()

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

    // Get story details
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
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

    // Determine credit cost based on model - streamlined to working models only
    const getModelConfig = (modelName: string) => {
      const stylePrefix = "Sharp contemporary editorial illustration. Professional graphic journalism. Sophisticated adult audience. NOT cartoon, NOT childlike, NOT whimsical. ";
      
      switch (modelName) {
        case 'gemini-image':
          return { credits: 1, cost: 0.039, provider: 'gemini', stylePrefix };
        case 'gpt-image-1':
          return { credits: 8, cost: 0.06, provider: 'openai', stylePrefix };
        case 'ideogram':
          return { credits: 3, cost: 0.08, provider: 'ideogram', stylePrefix }; // Optimized with smaller size
        case 'dall-e-3':
          return { credits: 5, cost: 0.04, provider: 'openai', stylePrefix };
        case 'flux-schnell':
          return { credits: 2, cost: 0.01, provider: 'huggingface', stylePrefix };
        case 'nebius-flux':
          return { credits: 1, cost: 0.0013, provider: 'nebius', stylePrefix }; // Cheapest option
        default:
          return { credits: 5, cost: 0.04, provider: 'openai', stylePrefix };
      }
    };

    const modelConfig = getModelConfig(model);

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

    // First, analyze the story tone to determine appropriate visual mood
    const toneAnalysisPrompt = `Analyze this news story and determine the appropriate emotional tone for an editorial cartoon:

HEADLINE: "${story.title}"

STORY NARRATIVE:
${slideContent || 'No additional context available'}

Based on both the headline and the full narrative, respond with ONE word only from: serious, lighthearted, playful, contentious, somber`;

    let storyTone = 'balanced'; // fallback
    
    // Use OpenAI for tone analysis if available
    if (Deno.env.get('OPENAI_API_KEY')) {
      try {
        const toneResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an editorial cartoon expert who assesses story tone.' },
              { role: 'user', content: toneAnalysisPrompt }
            ],
            max_tokens: 10,
            temperature: 0.3
          }),
        });
        
        if (toneResponse.ok) {
          const toneData = await toneResponse.json();
          storyTone = toneData.choices[0]?.message?.content?.trim().toLowerCase() || 'balanced';
        }
      } catch (error) {
        console.error('Tone analysis failed, using balanced tone:', error);
      }
    }

    // Map tone to expression guidance emphasizing variety
    const toneGuidance: Record<string, string> = {
      serious: 'range of engaged expressions showing concentration, concern, or contemplation - variety in how different characters process serious subject matter',
      lighthearted: 'variety of natural, relaxed expressions - gentle engagement with the subject, comfortable and accessible',
      playful: 'diverse upbeat expressions showing different ways people engage with lighter subjects - varied energy levels',
      contentious: 'range of animated expressions showing debate, discussion, or strong feelings - variety in how people express disagreement or passion',
      somber: 'varied reflective expressions - different ways people show gravity, from quiet thought to visible emotion',
      balanced: 'natural variety in expressions - show multiple characters or moments with different emotional responses to the same subject'
    };

    const expressionInstruction = toneGuidance[storyTone] || toneGuidance['balanced'];

    // Second, analyze the story subject matter to extract key visual elements
    const subjectAnalysisPrompt = `Analyze this news story and extract key visual elements for an editorial illustration:

HEADLINE: "${story.title}"

FULL STORY NARRATIVE:
${slideContent || 'No additional context available'}

Based on the complete story (not just the headline), identify and list in 3-4 concise sentences:
1. Primary subject matter and specific angle taken in the narrative
2. Unique visual elements emphasized in the story (objects, activities, settings, people)
3. Setting details, atmosphere, and regional context
4. Any specific details or moments that make THIS story distinctive

Focus on concrete visual details from the FULL narrative that would make an illustration immediately recognizable as THIS specific story with THIS particular angle.`;

    let subjectMatter = 'contemporary scene related to the story'; // fallback
    
    // Extract subject matter using OpenAI
    if (Deno.env.get('OPENAI_API_KEY')) {
      try {
        const subjectResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an expert at identifying visual elements in news stories for illustration purposes.' },
              { role: 'user', content: subjectAnalysisPrompt }
            ],
            max_tokens: 150,
            temperature: 0.4
          }),
        });
        
        if (subjectResponse.ok) {
          const subjectData = await subjectResponse.json();
          subjectMatter = subjectData.choices[0]?.message?.content?.trim() || subjectMatter;
          console.log('Subject matter extracted:', subjectMatter);
        }
      } catch (error) {
        console.error('Subject analysis failed, using generic fallback:', error);
      }
    }

    // Generate optimized illustration prompt with subject-first structure
    const illustrationPrompt = `${modelConfig.stylePrefix}

Create a contemporary editorial cartoon illustration. NO TEXT, NO WORDS, NO LETTERS, NO SENTENCES, NO PHRASES anywhere in the image.

[VISUAL STYLE: ligne claire, clean line art, bold outline drawing, Hergé Tintin style, minimal detail, no crosshatching, no texture, outline only]

SUBJECT MATTER - PRIMARY FOCUS (analyzed from full story):
${subjectMatter}

Story headline: "${story.title}"
(Note: This illustration is based on analysis of the complete story narrative, not just the headline)

VISUAL CONCEPT:
Illustrate the core subject identified above, drawing primarily from the opening narrative while using later details for background context. Show the story through varied character expressions and body language - different people respond differently to the same situation. The scene should immediately communicate what this story is about through specific visual elements (objects, activities, settings, character interactions) rather than generic representations. Focus on the unique aspects that distinguish this story.

          STYLE & COMPOSITION:
          Bold outline-driven editorial cartoon with DRAMATIC LINE WEIGHT VARIATION (essential for hand-drawn personality). Channel the ARTISTIC PERSONALITY of master editorial cartoonists: David Levine's confident NYT caricature strokes (thick to thin), Ronald Searle's expressive British wit (nervous energy in linework), Ralph Steadman's controlled chaos (bold decisive marks), Ben Shahn's social realist confidence. Draw with the ENERGY of a skilled editorial cartoonist working on deadline - some lines THICK and bold, others THIN and delicate. Pure black (#000000) on white (#FFFFFF). Solid black shadow shapes (no hatching/crosshatching).

RENDERING PERSONALITY REQUIREMENTS - CRITICAL:
          No shading. No hatching. No crosshatching. No stippling. No texture. No gradients. Just VARIED-WEIGHT black outlines and solid black fills. Visual interest comes from DRAMATIC LINE WEIGHT VARIATION and confident hand-drawn energy.
          
          STROKE WEIGHT HIERARCHY (thickest to thinnest):
          1. Main foreground figure outlines: THICK bold strokes (3-4x baseline weight) - commanding presence
          2. Important objects/focal points: MEDIUM-THICK strokes (2-3x baseline) - visual emphasis
          3. Secondary elements: MEDIUM strokes (1.5-2x baseline) - supporting cast
          4. Background elements: THIN strokes (0.5-1x baseline) - atmospheric depth
          5. Delicate details (facial features, hands): THIN elegant strokes (0.3-0.5x baseline) - precision and sophistication

VISUAL MATURITY:
Editorial cartoon sophistication for adult readers - the artistic confidence and visual intelligence of a master newspaper cartoonist. Hand-drawn artistry with purpose and skill, not playful whimsy. Think Op-Ed illustration, political cartooning for grown-ups, visual journalism with personality and craft. Professional editorial cartoon quality referencing masters of the form. Avoid: childish proportions, juvenile styling, cute rounded aesthetics meant for kids, animation character design, generic vector graphics, sterile digital output.

TONE GUIDANCE:
${storyTone.toUpperCase()} - ${expressionInstruction}

DIVERSITY PRINCIPLES:
- Ensure representation reflects contemporary diverse society naturally within the scene context
- Avoid defaulting to homogeneous demographics; include varied ages, ethnicities, and styles when depicting people

          Line work: DRAMATIC line weight variation is the key to personality - maintain economy of ELEMENTS but EXPLOSIVE variety in LINE WEIGHT. Some lines THICK and confident (foreground figures), others THIN and delicate (background, fine details). Sharp observational drawing quality (not rounded children's comic style). Think Op-Ed illustration masters: confident pen control with NATURAL HAND ENERGY, adult facial structure, journalistic sophistication. NO decorative strokes. NO texture. NO shading lines inside shapes.
          
          LINE WEIGHT DYNAMICS (create depth and personality through stroke contrast):
          ❌ STERILE: All lines same weight → computer-generated uniformity → lifeless
          ✅ PERSONALITY: Foreground figures THICK bold strokes (3-4x baseline) → Middle ground MEDIUM strokes (1.5-2x) → Background THIN strokes (0.5-1x) → Delicate facial features THIN elegant lines (0.3-0.5x) → FEELS HAND-DRAWN BY A MASTER
          
          HUMAN HAND QUALITIES (inject organic energy):
          • Slight line wobble in long strokes (not mechanical ruler-straight)
          • Natural taper at stroke ends (confident pen lift)
          • Lines that "breathe" - not robotic consistency
          • Vary pressure: heavy confident strokes vs. light delicate touches
          • Natural hand tremor in detail work (adds authenticity)

CHARACTER PORTRAYAL (when depicting people):
Sharp, observational drawing of mature adults - NOT rounded children's comic faces. Think David Levine caricature intelligence, editorial cartoon sophistication, visual journalism. Adults depicted with realistic proportions, angular facial structure where appropriate, mature body language. Avoid: rounded "friendly" faces from adventure comics, simplified children's book character design, cute proportions. Serious facial structure appropriate for news illustration - avoid caricature unless specifically editorial/satirical. Natural diversity in posture, gesture, and response while maintaining visual sophistication. Show varied reactions, but maintain professional illustration quality. Reference: contemporary editorial illustration for serious journalism (NYT Opinion section, The Guardian Long Reads, Financial Times visual style).

ANATOMICAL CORRECTNESS:
When figures are partially visible in frame, ensure all visible body parts follow natural physics:
- If legs/feet are visible, they must be properly grounded on surfaces
- Limbs must not appear to merge with or sink into ground/floors/surfaces
- Body parts must have clear boundaries from environment
- Partial figures should be cropped at natural boundaries (shoulders, waist, mid-thigh) not at joints

If showing a person from waist-up, knees-up, or any cropped view: this is perfectly fine for composition. But if their feet/legs ARE visible in the frame, they must be drawn with correct spatial relationship to the ground.

EXPLICIT STYLE EXCLUSIONS:
DO NOT create: children's book art, whimsical styling meant for kids, rounded "cute" aesthetics, exaggerated childish proportions, juvenile visual language, simplified shapes for children, friendly rounded characters meant for toddlers, children's adventure comic style (Tintin, Asterix), rounded friendly faces from kids' comics, simplified character designs meant for young readers, animation-style rendering, comic book superhero styling, generic sterile vector graphics, algorithmic digital output lacking artistic personality, excessive crosshatching, decorative stippling, over-rendered textures, complex pen-and-ink rendering techniques, heavily shaded illustrations, intricate hatching patterns that obscure clarity.

INSTEAD: Create sharp, observational editorial cartoon illustration for sophisticated adult readers. Reference visual Op-Ed masters (David Levine NYT caricatures, Ben Shahn social realism, Edel Rodriguez political posters) - outline-driven clarity with adult intelligence and journalistic sophistication. Clean lines that capture character and situation with economy, not cute adventure comic simplicity. Think visual Op-Ed by a skilled editorial cartoonist - New Yorker illustration, political cartoon masters, visual journalism with craft and personality. Hand-drawn artistry, not vector graphics. Editorial cartoon sophistication, not entertainment for children. Create clean, outline-driven editorial cartoons with bold contours and minimal rendering. Shadows = solid black shapes. Details = only what's essential to story. Think "confident outline + strategic solid blacks" NOT "skillful hatching demonstration."

CRITICAL: The illustration must be immediately recognizable as being about THIS specific story's subject matter. Prioritize subject-specific visual elements over generic scene-setting.

Avoid: Dated aesthetics, retro styling (unless story-specific), generic "people in front of building" compositions, excessive rendering with decorative hatching, limbs merging with surfaces, legs sinking into ground, feet disappearing into floors, anatomically impossible spatial relationships between figures and environment, body parts fading into backgrounds.

FINAL REMINDER: This is a CLEAN LINE DRAWING with DRAMATIC LINE WEIGHT VARIATION. Pure black and white only. THICK bold strokes for foreground figures → THIN delicate lines for background details. Bold black outlines with NATURAL HAND ENERGY (slight wobble, organic taper, breathing lines - not robotic uniformity). Solid black shadows. Zero hatching. Zero crosshatching. Zero stippling. Zero texture fills. Zero gradients. Human hand energy, not computer-generated uniformity. Think: "What would David Levine or Ronald Searle draw with VARIED-WEIGHT black ink strokes and solid black fills - confident, expressive, ALIVE with artistic personality?" If you add decorative pen detail inside outlined shapes, you have failed the assignment.`;

    // Generate image based on selected model
    const startTime = Date.now()
    let imageBase64: string
    let generationTime: number

    if (modelConfig.provider === 'gemini') {
      // Use Lovable AI Gateway for Gemini image generation
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
      
      if (!lovableApiKey) {
        console.error('LOVABLE_API_KEY not found in environment')
        throw new Error('Lovable AI is not enabled. Please contact support to enable Lovable AI Gateway for your project.')
      }

      console.log('Attempting Gemini image generation via Lovable AI Gateway')

      const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: [
            {
              role: 'user',
              content: illustrationPrompt
            }
          ],
          modalities: ['image', 'text']
        }),
      })

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.text()
        console.error('Gemini API error response:', geminiResponse.status, errorData)
        
        // Parse error for better messaging
        try {
          const errorJson = JSON.parse(errorData)
          if (errorJson.message?.includes('API key')) {
            throw new Error('Lovable AI authentication failed. Please verify your project has Lovable AI enabled.')
          }
        } catch (e) {
          // Continue with generic error
        }
        
        throw new Error(`Gemini API error (${geminiResponse.status}): ${errorData}`)
      }

      const geminiData = await geminiResponse.json()
      console.log('Gemini response structure:', JSON.stringify(geminiData, null, 2))

      const extractImageDataUrl = (data: any): string | null => {
        const choice = data?.choices?.[0]
        const message = choice?.message ?? {}

        // Original Lovable gateway format
        const legacyUrl = message?.images?.[0]?.image_url?.url
        if (legacyUrl) return legacyUrl

        const possibleContent = Array.isArray(message?.content)
          ? message.content
          : Array.isArray(choice?.content)
            ? choice.content
            : []

        for (const part of possibleContent) {
          if (!part) continue

          if (typeof part === 'string' && part.startsWith('data:image')) {
            return part
          }

          if (typeof part === 'object') {
            if (part?.type === 'output_image' && part?.image_base64) {
              return `data:image/png;base64,${part.image_base64}`
            }

            if (part?.image_base64) {
              return `data:image/png;base64,${part.image_base64}`
            }

            const partUrl = part?.image_url?.url ?? part?.url
            if (typeof partUrl === 'string') {
              return partUrl
            }
          }
        }

        const dataArray = Array.isArray(data?.data) ? data.data : []
        const b64Json = dataArray?.[0]?.b64_json
        if (typeof b64Json === 'string') {
          return `data:image/png;base64,${b64Json}`
        }

        return null
      }

      const imageDataUrl = extractImageDataUrl(geminiData)

      if (!imageDataUrl) {
        console.error('No image data in Gemini response:', geminiData)
        throw new Error('No image data received from Gemini API - response format unexpected')
      }

      // Extract base64 from data URL (format: data:image/png;base64,...)
      imageBase64 = imageDataUrl.includes('base64,') ? imageDataUrl.split(',')[1] : imageDataUrl
      console.log('Successfully extracted base64 image data from Gemini')
    } else if (modelConfig.provider === 'openai') {
      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        },
        body: JSON.stringify({
          model: model,
          prompt: illustrationPrompt,
          n: 1,
          size: model === 'gpt-image-1' ? '1536x1024' : (model === 'dall-e-3' ? '1792x1024' : '1024x1024'),
          ...(model === 'gpt-image-1' ? {
            // GPT-Image-1 specific parameters
            quality: 'high',
            output_format: 'png',
            background: 'opaque'
          } : {
            // DALL-E models
            response_format: 'b64_json',
            ...(model === 'dall-e-3' ? { quality: 'hd' } : {})
          })
        }),
      })

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.text()
        console.error('OpenAI API error:', errorData)
        throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
      }

      const imageData = await openaiResponse.json()
      
      // Handle different response formats
      if (model === 'gpt-image-1') {
        // GPT-Image-1 returns base64 directly in different format
        imageBase64 = imageData.data[0].b64_json || imageData.data[0].image
      } else {
        // DALL-E models return b64_json field
        imageBase64 = imageData.data[0].b64_json
      }
      
      if (!imageBase64) {
        console.error('No image data received from OpenAI:', imageData)
        throw new Error('No image data received from OpenAI API')
      }
    } else if (modelConfig.provider === 'huggingface') {
      // FLUX.1-schnell via Hugging Face - smaller dimensions for cost savings
      const hfResponse = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: illustrationPrompt,
          parameters: {
            width: 512,
            height: 640
          },
          options: {
            wait_for_model: true
          }
        }),
      })

      if (!hfResponse.ok) {
        const errorData = await hfResponse.text()
        console.error('Hugging Face API error:', errorData)
        throw new Error(`Hugging Face API error: ${hfResponse.statusText}`)
      }

      const imageBlob = await hfResponse.blob()
      const arrayBuffer = await imageBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      imageBase64 = safeBase64Encode(uint8Array)
    } else if (modelConfig.provider === 'ideogram') {
      // Ideogram API - use smaller aspect ratio setting
      const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY')
      
      if (!ideogramApiKey) {
        throw new Error('Ideogram API key not configured')
      }
      
      console.log('Making Ideogram API request...')
      
      const ideogramResponse = await fetch('https://api.ideogram.ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': ideogramApiKey,
        },
        body: JSON.stringify({
          image_request: {
            prompt: illustrationPrompt,
            aspect_ratio: 'ASPECT_3_2', // 3:2 landscape aspect ratio for editorial style
            model: 'V_2_TURBO', 
            magic_prompt_option: 'ON',
            style_type: 'DESIGN'
            // Remove resolution parameter - Ideogram will use aspect_ratio automatically
          }
        }),
      })

      console.log('Ideogram response status:', ideogramResponse.status)

      if (!ideogramResponse.ok) {
        const errorData = await ideogramResponse.text()
        console.error('Ideogram API error:', ideogramResponse.status, errorData)
        throw new Error(`Ideogram API error: ${ideogramResponse.status} - ${errorData}`)
      }

      const ideogramData = await ideogramResponse.json()
      console.log('Ideogram response:', JSON.stringify(ideogramData, null, 2))
      
      if (ideogramData.data && ideogramData.data.length > 0 && ideogramData.data[0].url) {
        // Download the image and convert to base64
        const imageResponse = await fetch(ideogramData.data[0].url)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image from Ideogram: ${imageResponse.status}`)
        }
        const imageBlob = await imageResponse.blob()
        const arrayBuffer = await imageBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        imageBase64 = safeBase64Encode(uint8Array)
      } else {
        console.error('Ideogram unexpected response format:', ideogramData)
        throw new Error('Ideogram generation failed - no image URL in response')
      }
    } else if (modelConfig.provider === 'nebius') {
      // Nebius Studio - ultra cost-effective FLUX
      const nebiusResponse = await fetch('https://api.studio.nebius.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('NEBIUS_API_KEY')}`,
        },
        body: JSON.stringify({
          model: 'flux-1.1-pro-ultra',
          prompt: illustrationPrompt,
          width: 512,
          height: 640,
          num_images: 1,
          guidance_scale: 3.5,
          num_inference_steps: 28,
          seed: Math.floor(Math.random() * 2147483647) // Random seed for variety
        }),
      })

      if (!nebiusResponse.ok) {
        const errorData = await nebiusResponse.text()
        console.error('Nebius API error:', errorData)
        throw new Error(`Nebius API error: ${nebiusResponse.statusText}`)
      }

      const nebiusData = await nebiusResponse.json()
      if (nebiusData.data && nebiusData.data[0] && nebiusData.data[0].url) {
        // Download the image and convert to base64
        const imageResponse = await fetch(nebiusData.data[0].url)
        const imageBlob = await imageResponse.blob()
        const arrayBuffer = await imageBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        imageBase64 = safeBase64Encode(uint8Array)
      } else {
        throw new Error('Nebius generation failed or returned no image')
      }
    } else {
      throw new Error(`Model ${model} provider ${modelConfig.provider} not implemented`)
    }

    generationTime = Date.now() - startTime
    const estimatedCost = modelConfig.cost

    // Track API usage and cost for analytics (skip if user lacks permission)
    try {
      const { error: usageError } = await supabase
        .from('api_usage')
        .insert({
          service_name: modelConfig.provider,
          operation: 'image_generation',
          cost_usd: estimatedCost,
          tokens_used: 0, // Not applicable for image generation
          region: null // Could be enhanced to track user region
        })

      if (usageError) {
        console.error('Failed to log API usage (this is non-critical):', usageError)
        // Don't fail the request if usage logging fails
      }
    } catch (error) {
      console.error('API usage logging failed (this is non-critical):', error)
      // Continue with the request even if logging fails
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

    // Update story with illustration
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        cover_illustration_url: imageUrl,
        cover_illustration_prompt: illustrationPrompt,
        illustration_generated_at: new Date().toISOString()
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