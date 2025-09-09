import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  action: 'cleanup_content' | 'delete_topics'
  topic_ids: string[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, topic_ids }: CleanupRequest = await req.json()

    console.log(`🧹 Clean slate migration - Action: ${action}, Topics: ${topic_ids.length}`)

    const results = []

    if (action === 'cleanup_content') {
      // Clean content from topics (keep topics, delete all content)
      for (const topicId of topic_ids) {
        console.log(`🧹 Cleaning content for topic: ${topicId}`)
        
        const { data, error } = await supabase.rpc('bulk_cleanup_topic_content', {
          p_topic_id: topicId
        })

        if (error) {
          console.error(`❌ Error cleaning topic ${topicId}:`, error)
          results.push({
            topic_id: topicId,
            success: false,
            error: error.message
          })
        } else {
          console.log(`✅ Cleaned topic ${topicId}:`, data)
          results.push({
            topic_id: topicId,
            success: true,
            data
          })
        }
      }
    } else if (action === 'delete_topics') {
      // Delete topics entirely using existing function
      for (const topicId of topic_ids) {
        console.log(`🗑️ Deleting topic entirely: ${topicId}`)
        
        const { data, error } = await supabase.rpc('delete_topic_cascade', {
          p_topic_id: topicId
        })

        if (error) {
          console.error(`❌ Error deleting topic ${topicId}:`, error)
          results.push({
            topic_id: topicId,
            success: false,
            error: error.message
          })
        } else {
          console.log(`✅ Deleted topic ${topicId}:`, data)
          results.push({
            topic_id: topicId,
            success: true,
            data
          })
        }
      }
    }

    // Log the overall results
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`🎯 Clean slate migration completed - Success: ${successCount}, Failures: ${failureCount}`)

    return new Response(JSON.stringify({
      success: true,
      action,
      results,
      summary: {
        total_topics: topic_ids.length,
        successful: successCount,
        failed: failureCount
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Clean slate migration error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
