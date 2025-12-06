import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
    
    // Get scheduler configuration from settings
    const { data: schedulerSettings } = await supabase
      .from('scheduler_settings')
      .select('*')
      .eq('setting_key', 'scraper_schedule')
      .single();

    // Check if scraping is enabled
    if (!schedulerSettings?.setting_value?.enabled) {
      console.log('⏭️ Automated scraping is disabled in settings');
      return new Response(JSON.stringify({
        success: true,
        message: 'Scraping disabled in settings',
        processed_sources: 0,
        successful_scrapes: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const config = schedulerSettings.setting_value;
    console.log('📋 Scheduler config:', config);
    
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
      .lte('next_run_at', new Date(Date.now() + 60000).toISOString()) // Add 1 minute buffer
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

          // Get the topic associated with this source for proper region handling
          const { data: sourceWithTopic } = await supabase
            .from('content_sources')
            .select('topic_id, topics(region)')
            .eq('id', schedule.source_id)
            .single();

          // Call the universal topic scraper (consolidated scraping path)
          const scrapeResponse = await supabase.functions.invoke('universal-topic-scraper', {
            body: {
              topicId: sourceWithTopic?.topic_id,
              sourceIds: [schedule.source_id]
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
            ? Math.min(100, 100 + 1) 
            : Math.max(0, 100 - 5);

          await supabase
            .from('scrape_schedules')
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: nextRunTime.toISOString(),
              run_count: 1
            })
            .eq('id', schedule.id);

          processedSources++;
          
          // Add delay between sources to be respectful
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`❌ Error processing source ${schedule.source_id}:`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Error processing source: ${errorMessage}`);

          // Update job as failed if it exists
          await supabase
            .from('scrape_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: errorMessage
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
              run_count: 1
            })
            .eq('id', schedule.id);
        }
      }
    }

    // 3. Process content generation queue
    console.log('🔄 Processing content generation queue...');
    let queueProcessed = 0;
    try {
      const queueResponse = await supabase.functions.invoke('queue-processor', {});
      if (queueResponse.data?.success) {
        queueProcessed = queueResponse.data.processed || 0;
        console.log(`✅ Queue processor completed: ${queueProcessed} jobs processed`);
      } else {
        console.error('❌ Queue processor failed:', queueResponse.error);
        errors.push(`Queue processing failed: ${queueResponse.error?.message || 'Unknown error'}`);
      }
    } catch (queueError) {
      console.error('❌ Error invoking queue processor:', queueError);
      const queueErrorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      errors.push(`Queue processor error: ${queueErrorMessage}`);
    }

    // 4. Check for roundup generation
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday

    // Daily Roundup: 8 PM (20:00) every day
    if (hour === 20) {
      console.log('🗓️ Triggering daily roundup generation...');
      try {
        const { data: topics } = await supabase
          .from('topics')
          .select('id, slug')
          .eq('is_active', true);

        if (topics && topics.length > 0) {
          for (const topic of topics) {
            const today = now.toISOString().split('T')[0];
            
            // Check if roundup already exists for today
            const { data: existing } = await supabase
              .from('topic_roundups')
              .select('id')
              .eq('topic_id', topic.id)
              .eq('roundup_type', 'daily')
              .gte('period_start', `${today}T00:00:00`)
              .lte('period_start', `${today}T23:59:59`)
              .maybeSingle();

            if (!existing) {
              const roundupResponse = await supabase.functions.invoke('generate-daily-roundup', {
                body: { topic_id: topic.id, date: today }
              });

              if (roundupResponse.data?.success) {
                console.log(`✅ Daily roundup generated for ${topic.slug}`);
                
                // Send notification
                await supabase.functions.invoke('send-story-notification', {
                  body: {
                    topicId: topic.id,
                    notificationType: 'daily',
                    roundupDate: today
                  }
                });
              } else {
                console.error(`❌ Daily roundup failed for ${topic.slug}:`, roundupResponse.error);
              }
            } else {
              console.log(`⏭️ Daily roundup already exists for ${topic.slug}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (roundupError) {
        console.error('❌ Daily roundup generation error:', roundupError);
        errors.push(`Daily roundup error: ${roundupError instanceof Error ? roundupError.message : String(roundupError)}`);
      }
    }

    // Weekly Roundup: 6 AM (06:00) on Sunday (aligned with morning cron job)
    if (hour === 6 && dayOfWeek === 0) {
      console.log('📅 Triggering weekly roundup generation...');
      try {
        const { data: topics } = await supabase
          .from('topics')
          .select('id, slug')
          .eq('is_active', true);

        if (topics && topics.length > 0) {
          for (const topic of topics) {
            // Get Monday of current week
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 6); // Go back to Monday
            const weekStartStr = weekStart.toISOString().split('T')[0];
            
            // Check if roundup already exists for this week
            const { data: existing } = await supabase
              .from('topic_roundups')
              .select('id')
              .eq('topic_id', topic.id)
              .eq('roundup_type', 'weekly')
              .gte('period_start', `${weekStartStr}T00:00:00`)
              .maybeSingle();

            if (!existing) {
              const roundupResponse = await supabase.functions.invoke('generate-weekly-roundup', {
                body: { topic_id: topic.id, week_start: weekStartStr }
              });

              if (roundupResponse.data?.success) {
                console.log(`✅ Weekly roundup generated for ${topic.slug}`);
                
                // Send notification
                await supabase.functions.invoke('send-story-notification', {
                  body: {
                    topicId: topic.id,
                    notificationType: 'weekly',
                    weekStart: weekStartStr
                  }
                });
              } else {
                console.error(`❌ Weekly roundup failed for ${topic.slug}:`, roundupResponse.error);
              }
            } else {
              console.log(`⏭️ Weekly roundup already exists for ${topic.slug}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (roundupError) {
        console.error('❌ Weekly roundup generation error:', roundupError);
        errors.push(`Weekly roundup error: ${roundupError instanceof Error ? roundupError.message : String(roundupError)}`);
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      duration_ms: duration,
      processed_sources: processedSources,
      successful_scrapes: successfulScrapes,
      failed_scrapes: processedSources - successfulScrapes,
      queue_jobs_processed: queueProcessed,
      errors: errors,
      scheduler_config: config,
      next_scheduler_run: new Date(Date.now() + ((config?.frequency_hours || 24) * 60 * 60 * 1000)).toISOString()
    };

    console.log('🎉 Automated scheduler completed:', summary);

    // Log the scheduler run to system logs
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Timezone-aware automated scheduler completed: ${processedSources} sources processed, ${successfulScrapes} successful, ${queueProcessed} queue jobs processed`,
        context: summary,
        function_name: 'automated-scheduler'
      });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Automated scheduler error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResponse = {
      success: false,
      error: errorMessage,
      duration_ms: Date.now() - Date.now(),
      processed_sources: 0,
      successful_scrapes: 0,
      failed_scrapes: 0,
      errors: [errorMessage]
    };

    // Log the error
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `Automated scheduler failed: ${errorMessage}`,
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