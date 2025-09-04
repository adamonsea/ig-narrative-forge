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

    // Determine credit cost based on model
    const getModelConfig = (modelName: string) => {
      switch (modelName) {
        case 'gpt-image-1':
          return { credits: 10, cost: 0.06, provider: 'openai' };
        case 'dall-e-2':
          return { credits: 3, cost: 0.02, provider: 'openai' };
        case 'flux-schnell':
          return { credits: 2, cost: 0.01, provider: 'huggingface' };
        case 'midjourney':
          return { credits: 3, cost: 0.02, provider: 'midjourney' };
        case 'nebius-flux':
          return { credits: 2, cost: 0.015, provider: 'nebius' };
        default:
          return { credits: 10, cost: 0.06, provider: 'openai' };
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

    // Generate optimized illustration prompt
    const illustrationPrompt = `Create a minimalist black and white line drawing illustration. NO TEXT, NO WORDS, NO LETTERS, NO SENTENCES, NO PHRASES anywhere in the image.

Visual concept: "${story.title}"

Style: Clean black ink line art on pure white background. Simple editorial illustration style, minimalist hand-drawn aesthetic, precise linework, newspaper-ready artwork. Technical drawing style with clear contours and uncluttered composition.`

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
          model: model === 'gpt-image-1' ? 'dall-e-3' : model, // Use dall-e-3 for gpt-image-1
          prompt: illustrationPrompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
          ...(model === 'dall-e-3' ? {
            quality: 'hd',
          } : {}),
          ...(model === 'gpt-image-1' ? {
            quality: 'hd',
          } : {})
        }),
      })

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.text()
        console.error('OpenAI API error:', errorData)
        throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
      }

      const imageData = await openaiResponse.json()
      
      // Both models return b64_json field
      imageBase64 = imageData.data[0].b64_json
      
      if (!imageBase64) {
        console.error('No image data received from OpenAI:', imageData)
        throw new Error('No image data received from OpenAI API')
      }
    } else if (modelConfig.provider === 'huggingface') {
      // FLUX.1-schnell via Hugging Face
      const hfResponse = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: illustrationPrompt,
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
      imageBase64 = btoa(String.fromCharCode(...uint8Array))
    } else if (modelConfig.provider === 'midjourney') {
      // MidJourney via kie.ai
      const mjResponse = await fetch('https://api.kie.ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('KIE_AI_API_KEY')}`,
        },
        body: JSON.stringify({
          prompt: illustrationPrompt,
          model: 'midjourney',
          aspect_ratio: '1:1'
        }),
      })

      if (!mjResponse.ok) {
        const errorData = await mjResponse.text()
        console.error('MidJourney API error:', errorData)
        throw new Error(`MidJourney API error: ${mjResponse.statusText}`)
      }

      const mjData = await mjResponse.json()
      if (mjData.status === 'success' && mjData.image_url) {
        // Download the image and convert to base64
        const imageResponse = await fetch(mjData.image_url)
        const imageBlob = await imageResponse.blob()
        const arrayBuffer = await imageBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        imageBase64 = btoa(String.fromCharCode(...uint8Array))
      } else {
        throw new Error('MidJourney generation failed or returned no image')
      }
    } else if (modelConfig.provider === 'nebius') {
      // Nebius FLUX
      const nebiusResponse = await fetch('https://api.studio.nebius.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('NEBIUS_API_KEY')}`,
        },
        body: JSON.stringify({
          model: 'flux-1.1-pro',
          prompt: illustrationPrompt,
          width: 1024,
          height: 1024,
          num_images: 1
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
        imageBase64 = btoa(String.fromCharCode(...uint8Array))
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
      throw new Error(`Failed to process image data: ${decodeError.message}`)
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
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})