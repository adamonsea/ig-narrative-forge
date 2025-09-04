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

    // Helper function to generate optimized illustration prompt
    const createIllustrationPrompt = (title: string, variation = 0): string => {
      const basePrompts = [
        `Black ink line drawing of ${title}. Technical illustration style, clean pen strokes on white paper. Simple composition, minimal details, monochromatic artwork. Precise linework, hand-drawn aesthetic, sketch-like quality.`,
        `Hand-drawn line art depicting ${title}. Bold black ink on pure white background. Minimalist technical drawing, clear contours, simple geometric forms. Editorial illustration style, newspaper-ready artwork.`,
        `Simple line illustration representing ${title}. Black ink sketch, clean vector-style lines on white. Minimal graphic design, iconic representation, uncluttered composition. Professional editorial artwork.`
      ]
      return basePrompts[variation % basePrompts.length]
    }

    // Generate image with retry logic for better results
    const generateImage = async (promptVariation = 0, retryCount = 0): Promise<{ success: boolean; imageBase64?: string; error?: string }> => {
      if (retryCount > 2) {
        return { success: false, error: 'Max retries exceeded' }
      }

      const illustrationPrompt = createIllustrationPrompt(story.title, promptVariation)
      
      try {
        const hfResponse = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_KEY')}`,
          },
          body: JSON.stringify({
            inputs: illustrationPrompt,
            parameters: {
              width: 1024,
              height: 1024,
              num_inference_steps: 8,
              guidance_scale: 7.5
            }
          }),
        })

        if (!hfResponse.ok) {
          throw new Error(`Hugging Face API error: ${hfResponse.statusText}`)
        }

        const imageBlob = await hfResponse.blob()
        const arrayBuffer = await imageBlob.arrayBuffer()
        const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        
        return { success: true, imageBase64, illustrationPrompt }
      } catch (error) {
        console.log(`Generation attempt ${retryCount + 1} failed:`, error.message)
        // Try with different prompt variation on retry
        return generateImage((promptVariation + 1) % 3, retryCount + 1)
      }
    }

    // Generate the illustration
    const result = await generateImage()
    if (!result.success) {
      throw new Error(result.error || 'Failed to generate illustration after retries')
    }

    const { imageBase64, illustrationPrompt } = result

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