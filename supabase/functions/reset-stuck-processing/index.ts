import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Checking for stuck processing stories...')

    // Reset stories stuck in processing for more than 5 minutes
    const { data: stuckStories, error: selectError } = await supabase
      .from('stories')
      .select('id, title, article_id')
      .eq('status', 'processing')
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    if (selectError) {
      throw new Error(`Failed to find stuck stories: ${selectError.message}`)
    }

    if (!stuckStories || stuckStories.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No stuck stories found',
        reset_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${stuckStories.length} stuck stories:`, stuckStories.map(s => s.title))

    // Reset the stuck stories
    const { error: updateError } = await supabase
      .from('stories')
      .update({ 
        status: 'draft', 
        updated_at: new Date().toISOString() 
      })
      .in('id', stuckStories.map(s => s.id))

    if (updateError) {
      throw new Error(`Failed to reset stories: ${updateError.message}`)
    }

    // Create queue jobs for the reset stories
    const queueJobs = stuckStories.map(story => ({
      article_id: story.article_id,
      status: 'pending',
      slidetype: 'tabloid'
    }))

    const { error: queueError } = await supabase
      .from('content_generation_queue')
      .insert(queueJobs)

    if (queueError) {
      console.error('Failed to create queue jobs:', queueError.message)
      // Don't throw here, the stories are at least reset
    }

    console.log(`Successfully reset ${stuckStories.length} stories and created queue jobs`)

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Reset ${stuckStories.length} stuck stories`,
      reset_count: stuckStories.length,
      stories: stuckStories.map(s => s.title)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in reset-stuck-processing:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})