import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
      switch (modelName) {
        case 'gpt-image-1':
          return { credits: 8, cost: 0.06, provider: 'openai' };
        case 'ideogram':
          return { credits: 3, cost: 0.08, provider: 'ideogram' }; // Optimized with smaller size
        case 'dall-e-3':
          return { credits: 5, cost: 0.04, provider: 'openai' };
        case 'flux-schnell':
          return { credits: 2, cost: 0.01, provider: 'huggingface' };
        case 'nebius-flux':
          return { credits: 1, cost: 0.0013, provider: 'nebius' }; // Cheapest option
        default:
          return { credits: 5, cost: 0.04, provider: 'openai' };
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
    const toneAnalysisPrompt = `Analyze this headline and determine the appropriate emotional tone for an editorial cartoon:

"${story.title}"

Respond with ONE word only from: serious, lighthearted, playful, contentious, somber`;

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

    // Map tone to facial expression guidance
    const toneGuidance: Record<string, string> = {
      serious: 'neutral or concerned expressions - no smiles, thoughtful faces',
      lighthearted: 'gentle, mild expressions - slight smiles acceptable but not exaggerated',
      playful: 'upbeat expressions - comfortable with smiles but keep tasteful',
      contentious: 'tense or stern expressions - furrowed brows, no smiles',
      somber: 'grave, serious expressions - downcast eyes, no positive emotion',
      balanced: 'neutral, measured expressions - subtle, understated'
    };

    const expressionInstruction = toneGuidance[storyTone] || toneGuidance['balanced'];

    // Generate optimized illustration prompt with Private Eye satirical editorial cartoon style
    const illustrationPrompt = `Create a satirical editorial cartoon in the style of Private Eye magazine. NO TEXT, NO WORDS, NO LETTERS, NO SENTENCES, NO PHRASES anywhere in the image.

Visual concept: "${story.title}"

Tone: ${storyTone.toUpperCase()} - ${expressionInstruction}

Style: PEN AND INK ONLY - hand-drawn quality, confident but slightly imperfect lines. Think Private Eye magazine covers - clarity and simplicity above all. 

Line work: Drawn by an experienced editorial cartoonist - lines should feel certain and authoritative but NOT mechanically perfect. Hand-drawn confidence with natural variation - not sketchy, but not geometrically precise either. The authority of a practiced hand.

Composition: Solid black ink on pure white (#FFFFFF) background. NO gray tones, NO shading, NO cross-hatching. Clean, economical linework with maximum clarity. Witty and satirical but intelligent. Simple shapes, immediately readable. British satirical cartoon aesthetic - sharp, clear, unfussy.

CRITICAL: Match the emotional tone to the story content. ${expressionInstruction}

Avoid: Cross-hatching, dense pen work, intricate detail, mechanical precision, overly geometric shapes.`;

    // Generate image based on selected model
    const startTime = Date.now()
    let imageBase64: string
    let generationTime: number

    if (modelConfig.provider === 'openai') {
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