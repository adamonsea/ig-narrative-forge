import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledSource {
  id: string;
  source_id: string;
  source_name: string;
  feed_url: string;
  schedule_type: string;
  frequency_hours: number;
  last_run_at: string | null;
  next_run_at: string;
  is_active: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('🤖 Starting automated scheduler run...');
    const startTime = Date.now();
    
    // 1. Reset stalled processing jobs first
    console.log('🔧 Resetting stalled processing jobs...');
    const { error: resetError } = await supabase.rpc('reset_stalled_processing');
    if (resetError) {
      console.error('❌ Error resetting stalled processing:', resetError);
    } else {
      console.log('✅ Stalled processing jobs reset successfully');
    }
    
    // 2. Get all due schedules
    const { data: dueSchedules, error: scheduleError } = await supabase
      .from('scrape_schedules')
      .select(`
        id,
        source_id,
        schedule_type,
        frequency_hours,
        last_run_at,
        next_run_at,
        is_active,
        content_sources (
          source_name,
          feed_url,
          is_active,
          canonical_domain
        )
      `)
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString())
      .limit(50);

    if (scheduleError) {
      throw new Error(`Failed to fetch schedules: ${scheduleError.message}`);
    }

    console.log(`📋 Found ${dueSchedules?.length || 0} due schedules`);

    let processedSources = 0;
    let successfulScrapes = 0;
    let errors: string[] = [];

    if (dueSchedules && dueSchedules.length > 0) {
      for (const schedule of dueSchedules) {
        try {
          const source = schedule.content_sources as any;
          
          if (!source?.is_active || !source?.feed_url) {
            console.log(`⏭️ Skipping inactive or invalid source: ${source?.source_name || schedule.source_id}`);
            continue;
          }

          console.log(`🎯 Processing: ${source.source_name} (${source.feed_url})`);

          // Create a scrape job
          const { data: job, error: jobError } = await supabase
            .from('scrape_jobs')
            .insert({
              schedule_id: schedule.id,
              source_id: schedule.source_id,
              job_type: 'scrape',
              status: 'running',
              started_at: new Date().toISOString()
            })
            .select()
            .single();

          if (jobError) {
            errors.push(`Failed to create job for ${source.source_name}: ${jobError.message}`);
            continue;
          }

          // Call the universal scraper
          const scrapeResponse = await supabase.functions.invoke('universal-scraper', {
            body: {
              feedUrl: source.feed_url,
              sourceId: schedule.source_id,
              region: 'Eastbourne'
            }
          });

          if (scrapeResponse.error) {
            throw new Error(scrapeResponse.error.message || 'Scrape function failed');
          }

          const result = scrapeResponse.data;
          console.log(`✅ Scrape completed for ${source.source_name}:`, result);

          // Update job status
          await supabase
            .from('scrape_jobs')
            .update({
              status: result.success ? 'completed' : 'failed',
              completed_at: new Date().toISOString(),
              error_message: result.success ? null : result.error,
              result_data: result
            })
            .eq('id', job.id);

          if (result.success) {
            successfulScrapes++;
          } else {
            errors.push(`Scrape failed for ${source.source_name}: ${result.error || 'Unknown error'}`);
          }

          // Update schedule for next run
          const nextRunTime = new Date();
          nextRunTime.setHours(nextRunTime.getHours() + schedule.frequency_hours);
          
          const newSuccessRate = result.success 
            ? Math.min(100, (schedule.success_rate || 100) + 1) 
            : Math.max(0, (schedule.success_rate || 100) - 5);

          await supabase
            .from('scrape_schedules')
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: nextRunTime.toISOString(),
              run_count: (schedule.run_count || 0) + 1,
              success_rate: newSuccessRate
            })
            .eq('id', schedule.id);

          processedSources++;
          
          // Add delay between sources to be respectful
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`❌ Error processing source ${schedule.source_id}:`, error);
          errors.push(`Error processing source: ${error.message}`);

          // Update job as failed if it exists
          await supabase
            .from('scrape_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: error.message
            })
            .eq('schedule_id', schedule.id)
            .eq('status', 'running');

          // Still update schedule for next run to avoid getting stuck
          const nextRunTime = new Date();
          nextRunTime.setHours(nextRunTime.getHours() + schedule.frequency_hours);
          
          await supabase
            .from('scrape_schedules')
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: nextRunTime.toISOString(),
              run_count: (schedule.run_count || 0) + 1,
              success_rate: Math.max(0, (schedule.success_rate || 100) - 10)
            })
            .eq('id', schedule.id);
        }
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      duration_ms: duration,
      processed_sources: processedSources,
      successful_scrapes: successfulScrapes,
      failed_scrapes: processedSources - successfulScrapes,
      errors: errors,
      next_scheduler_run: new Date(Date.now() + (6 * 60 * 60 * 1000)).toISOString() // 6 hours
    };

    console.log('🎉 Automated scheduler completed:', summary);

    // Log the scheduler run to system logs
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Automated scheduler completed: ${processedSources} sources processed, ${successfulScrapes} successful`,
        context: summary,
        function_name: 'automated-scheduler'
      });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Automated scheduler error:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      duration_ms: Date.now() - Date.now(),
      processed_sources: 0,
      successful_scrapes: 0,
      failed_scrapes: 0,
      errors: [error.message]
    };

    // Log the error
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `Automated scheduler failed: ${error.message}`,
          context: errorResponse,
          function_name: 'automated-scheduler'
        });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});