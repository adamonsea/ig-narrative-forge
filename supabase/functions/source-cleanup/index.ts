import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  operation: 'cleanup_orphaned' | 'fix_sussex_express' | 'full_cleanup'
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

    const { operation }: CleanupRequest = await req.json()

    console.log(`🧹 Starting source cleanup operation: ${operation}`)

    let results: any[] = []

    if (operation === 'fix_sussex_express' || operation === 'full_cleanup') {
      console.log('🔧 Fixing Sussex Express sources...')
      const { data: sussexResult, error: sussexError } = await supabase.rpc('fix_sussex_express_sources')
      
      if (sussexError) {
        console.error('❌ Sussex Express fix failed:', sussexError)
        throw new Error(`Sussex Express fix failed: ${sussexError.message}`)
      }
      
      console.log('✅ Sussex Express fixed:', sussexResult)
      results.push({ operation: 'sussex_express_fix', result: sussexResult })
    }

    if (operation === 'cleanup_orphaned' || operation === 'full_cleanup') {
      console.log('🧹 Cleaning up orphaned sources...')
      const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_orphaned_sources')
      
      if (cleanupError) {
        console.error('❌ Orphaned sources cleanup failed:', cleanupError)
        throw new Error(`Orphaned sources cleanup failed: ${cleanupError.message}`)
      }
      
      console.log('✅ Orphaned sources cleaned up:', cleanupResult)
      results.push({ operation: 'orphaned_cleanup', result: cleanupResult })
    }

    // Get final source count for comparison
    const { count: finalCount, error: countError } = await supabase
      .from('content_sources')
      .select('*', { count: 'exact' })

    if (countError) {
      console.warn('⚠️ Could not get final source count:', countError)
    } else {
      console.log(`📊 Final source count: ${finalCount}`)
    }

    const summary = {
      success: true,
      operation,
      results,
      final_source_count: finalCount,
      timestamp: new Date().toISOString(),
      summary: results.map(r => r.result.message || 'Operation completed').join('; ')
    }

    console.log('🎯 Source cleanup completed successfully:', summary)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Source cleanup error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})