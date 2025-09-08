import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Starting schedule recovery and platform maintenance...')

    // 1. Generate missing schedules
    const { data: scheduleResult, error: scheduleError } = await supabase
      .rpc('auto_generate_missing_schedules')

    if (scheduleError) {
      console.error('Schedule generation failed:', scheduleError)
    } else {
      console.log(`✅ Generated ${scheduleResult?.schedules_created || 0} missing schedules`)
    }

    // 2. Recover unhealthy sources
    const { data: recoveryResult, error: recoveryError } = await supabase
      .rpc('recover_unhealthy_sources')

    if (recoveryError) {
      console.error('Source recovery failed:', recoveryError)
    } else {
      console.log(`✅ Recovered ${recoveryResult?.sources_recovered || 0} sources, deactivated ${recoveryResult?.sources_deactivated || 0}`)
    }

    // 3. Reset articles stuck in processing for too long
    const { data: resetResult, error: resetError } = await supabase
      .rpc('reset_stalled_stories')

    if (resetError) {
      console.error('Story reset failed:', resetError)
    } else {
      console.log(`✅ Reset ${resetResult || 0} stalled stories`)
    }

    // 4. Run emergency fixes
    try {
      const { data: fixResult, error: fixError } = await supabase.functions.invoke('universal-platform-fix')
      
      if (fixError) {
        console.error('Platform fix failed:', fixError)
      } else {
        console.log('✅ Universal platform fix completed')
      }
    } catch (error) {
      console.error('Failed to invoke universal platform fix:', error)
    }

    // 5. Clean up old logs and data
    await performMaintenanceCleanup(supabase)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Schedule recovery and platform maintenance completed',
        results: {
          schedules_created: scheduleResult?.schedules_created || 0,
          sources_recovered: recoveryResult?.sources_recovered || 0,
          sources_deactivated: recoveryResult?.sources_deactivated || 0,
          stories_reset: resetResult || 0,
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Schedule recovery failed:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Schedule recovery failed',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function performMaintenanceCleanup(supabase: any) {
  console.log('Performing maintenance cleanup...')
  
  try {
    // Clean up old system logs (keep 30 days)
    const { error: logsError } = await supabase
      .from('system_logs')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    
    if (logsError) {
      console.error('Failed to clean up old logs:', logsError)
    }
    
    // Clean up old scrape jobs (keep 7 days)
    const { error: jobsError } = await supabase
      .from('scrape_jobs')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    
    if (jobsError) {
      console.error('Failed to clean up old jobs:', jobsError)
    }
    
    console.log('✅ Maintenance cleanup completed')
    
  } catch (error) {
    console.error('Maintenance cleanup failed:', error)
  }
}
