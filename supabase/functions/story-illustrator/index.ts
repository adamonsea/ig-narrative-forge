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

    const { storyId } = await req.json()

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

    // Check if user is super admin (bypass credit deduction)
    const { data: hasAdminRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'superadmin'
    })
    
    const isSuperAdmin = hasAdminRole === true
    let creditResult = null

    // Deduct credits (10 credits for illustration) - skip for super admin
    if (!isSuperAdmin) {
      const { data: result, error: creditError } = await supabase.rpc('deduct_user_credits', {
        p_user_id: user.id,
        p_credits_amount: 10,
        p_description: 'Story illustration generation',
        p_story_id: storyId
      })

      creditResult = result

      if (creditError || !creditResult?.success) {
        return new Response(
          JSON.stringify({ 
            error: creditResult?.error || 'Failed to deduct credits',
            credits_required: 10
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

    // Generate image using OpenAI gpt-image-1 (premium model)
    const startTime = Date.now()
    const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: illustrationPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
        output_format: 'png',
        background: 'opaque'
      }),
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text()
      console.error('OpenAI API error:', errorData)
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
    }

    const imageData = await openaiResponse.json()
    const imageBase64 = imageData.data[0].b64_json
    const generationTime = Date.now() - startTime

    // Estimate cost for gpt-image-1 (approximately $0.10 per high-quality 1024x1024 image)
    const estimatedCost = 0.10

    // Track API usage and cost for analytics
    const { error: usageError } = await supabase
      .from('api_usage')
      .insert({
        service_name: 'openai',
        operation: 'image_generation',
        cost_usd: estimatedCost,
        tokens_used: 0, // Not applicable for image generation
        region: null // Could be enhanced to track user region
      })

    if (usageError) {
      console.error('Failed to log API usage:', usageError)
      // Don't fail the request if usage logging fails
    }

    // Upload to Supabase Storage
    const fileName = `story-${storyId}-${Date.now()}.png`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('visuals')
      .upload(fileName, 
        Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0)), 
        {
          contentType: 'image/png',
          upsert: false
        }
      )

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`)
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
        credits_used: isSuperAdmin ? 0 : 10,
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