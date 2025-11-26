import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  operation: 'cleanup_orphaned' | 'fix_sussex_express' | 'full_cleanup' | 'delete_except_core_topics'
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

    if (operation === 'delete_except_core_topics') {
      console.log('🧹 Deleting sources except Eastbourne, Kenilworth, and Medical device development...')
      
      const keepTopicIds = [
        'd224e606-1a4c-4713-8135-1d30e2d6d0c6', // Eastbourne
        '79fb5f44-47a3-493e-8b81-3ad8892cf69c', // Kenilworth
        '3f05c5a3-3196-455d-bff4-e9a9a20b8615'  // Medical device development
      ]
      
      // First get all sources that should be deleted
      const { data: sourcesToDelete, error: fetchError } = await supabase
        .from('content_sources')
        .select('id')
        .or(`topic_id.not.in.(${keepTopicIds.join(',')}),topic_id.is.null`)
      
      if (fetchError) {
        console.error('❌ Fetch sources failed:', fetchError)
        throw new Error(`Fetch sources failed: ${fetchError.message}`)
      }
      
      const sourceIdsToDelete = (sourcesToDelete || []).map(s => s.id)
      console.log(`Found ${sourceIdsToDelete.length} sources to delete`)
      
      if (sourceIdsToDelete.length === 0) {
        results.push({ 
          operation: 'delete_except_core_topics', 
          result: { 
            message: 'No sources to delete',
            junction_deleted: 0,
            sources_deleted: 0
          } 
        })
        return
      }
      
      // Delete junction table entries for these sources
      const { data: junctionDeleted, error: junctionError } = await supabase
        .from('topic_sources')
        .delete()
        .in('source_id', sourceIdsToDelete)
        .select()
      
      if (junctionError) {
        console.error('❌ Junction table cleanup failed:', junctionError)
        throw new Error(`Junction table cleanup failed: ${junctionError.message}`)
      }
      
      console.log('✅ Junction table entries deleted:', junctionDeleted?.length || 0)
      
      // Nullify source_id on articles before deleting sources
      const { data: orphanedArticles, error: orphanError } = await supabase
        .from('articles')
        .update({ source_id: null })
        .in('source_id', sourceIdsToDelete)
        .select('id')
      
      if (orphanError) {
        console.error('❌ Orphaning articles failed:', orphanError)
        throw new Error(`Orphaning articles failed: ${orphanError.message}`)
      }
      
      console.log('✅ Orphaned articles:', orphanedArticles?.length || 0)
      
      // Then delete the sources themselves
      const { data: deletedSources, error: deleteError } = await supabase
        .from('content_sources')
        .delete()
        .in('id', sourceIdsToDelete)
        .select()
      
      if (deleteError) {
        console.error('❌ Source deletion failed:', deleteError)
        throw new Error(`Source deletion failed: ${deleteError.message}`)
      }
      
      console.log('✅ Sources deleted:', deletedSources?.length || 0)
      results.push({ 
        operation: 'delete_except_core_topics', 
        result: { 
          message: `Deleted ${junctionDeleted?.length || 0} junction entries, orphaned ${orphanedArticles?.length || 0} articles, and deleted ${deletedSources?.length || 0} sources`,
          junction_deleted: junctionDeleted?.length || 0,
          articles_orphaned: orphanedArticles?.length || 0,
          sources_deleted: deletedSources?.length || 0
        } 
      })
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
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})