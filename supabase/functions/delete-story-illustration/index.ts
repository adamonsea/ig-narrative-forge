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

    // Get story details to verify it exists and get the illustration URL
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('cover_illustration_url')
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

    // If no illustration exists, return success anyway
    if (!story.cover_illustration_url) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No illustration to delete'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract filename from URL
    const url = story.cover_illustration_url
    const filename = url.substring(url.lastIndexOf('/') + 1)

    // Delete from storage if it exists
    try {
      const { error: deleteError } = await supabase.storage
        .from('visuals')
        .remove([filename])
      
      if (deleteError) {
        console.warn('Failed to delete file from storage (non-critical):', deleteError)
      }
    } catch (storageError) {
      console.warn('Storage deletion error (non-critical):', storageError)
    }

    // Update story to remove illustration references
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        cover_illustration_url: null,
        cover_illustration_prompt: null,
        illustration_generated_at: null
      })
      .eq('id', storyId)

    if (updateError) {
      throw new Error(`Failed to update story: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Illustration deleted successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Delete illustration error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})