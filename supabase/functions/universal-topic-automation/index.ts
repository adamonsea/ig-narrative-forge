import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationRequest {
  topicIds?: string[];
  dryRun?: boolean;
  force?: boolean;
  maxAgeDays?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let jobRunId: string | null = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Supabase environment variables' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { topicIds, dryRun = false, force = false, maxAgeDays = 7 } = await req.json() as AutomationRequest;

    console.log('Universal Topic Automation - Starting automation check');

    // Create job run for tracking
    const { data: jobRun, error: jobError } = await supabase
      .from('job_runs')
      .insert({
        job_type: 'topic_automation',
        status: 'pending',
        input_data: { topicIds, dryRun, force, maxAgeDays },
        scheduled_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create job run:', jobError);
    } else {
      jobRunId = jobRun.id;
      console.log('Created job run:', jobRunId);
    }

    // Get topics with their automation settings using direct query
    let baseQuery = supabase
      .from('topics')
      .select('id, name, is_active')
      .eq('is_active', true);
    
    if (topicIds && topicIds.length > 0) {
      baseQuery = baseQuery.in('id', topicIds);
    }
    
    const { data: topicsBase, error: topicsError } = await baseQuery;

    if (topicsError || !topicsBase) {
      throw new Error(`Failed to get topics: ${topicsError?.message}`);
    }

    // Fetch automation settings separately
    const { data: settings } = await supabase
      .from('topic_automation_settings')
      .select('*')
      .in('topic_id', topicsBase.map(t => t.id));
    
    // Combine data
    const topics = topicsBase.map(topic => ({
      ...topic,
      topic_automation_settings: settings?.filter(s => s.topic_id === topic.id) || []
    }));

    if (topics.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active topics found for automation',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    
    console.log(`🔍 Checking ${topics.length} topics for automation:`);
    topics.forEach(t => {
      console.log(`  - ${t.name}: settings=${JSON.stringify(t.topic_automation_settings)}`);
    });
    
    const topicsToScrape = topics.filter(topic => {
      // When force=true, include all active topics regardless of automation settings
      if (force) {
        console.log(`✅ Force mode - including topic: ${topic.name}`);
        return true;
      }

      // Otherwise, only include topics with active automation settings
      if (!topic.topic_automation_settings?.[0]?.is_active) {
        console.log(`❌ Topic ${topic.name}: automation not active (settings exist: ${!!topic.topic_automation_settings}, array length: ${topic.topic_automation_settings?.length})`);
        return false;
      }

      const settings = topic.topic_automation_settings[0];
      
      // Check if it's time to scrape based on schedule
      const nextRunAt = new Date(settings.next_run_at);
      const isDue = now >= nextRunAt;
      console.log(`🔍 Topic ${topic.name}: next_run=${settings.next_run_at}, now=${now.toISOString()}, isDue=${isDue}`);
      return isDue;
    });

    console.log(`Found ${topicsToScrape.length} topics ready for automated scraping`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          jobRunId,
          topicsToScrape: topicsToScrape.map(t => ({
            id: t.id,
            name: t.name,
            nextRunAt: t.topic_automation_settings[0]?.next_run_at,
            frequency: t.topic_automation_settings[0]?.scrape_frequency_hours
          })),
          message: `${topicsToScrape.length} topics would be scraped`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update job to processing
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', jobRunId);
    }

    const results = [];

    // Process each topic
    for (const topic of topicsToScrape) {
      try {
        console.log(`Starting automated scraping for topic: ${topic.name}`);

        // Call the universal topic scraper
        const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke(
          'universal-topic-scraper',
          {
            body: {
              topicId: topic.id,
              forceRescrape: false
            }
          }
        );

        if (scrapeError) {
          throw new Error(`Scraping failed: ${scrapeError.message}`);
        }

        // Update automation settings if they exist
        let nextRunAt: Date | null = null;
        if (topic.topic_automation_settings?.[0]) {
          const settings = topic.topic_automation_settings[0];
          nextRunAt = new Date(now.getTime() + (settings.scrape_frequency_hours * 60 * 60 * 1000));

          await supabase
            .from('topic_automation_settings')
            .update({
              last_run_at: now.toISOString(),
              next_run_at: nextRunAt.toISOString(),
              updated_at: now.toISOString()
            })
            .eq('topic_id', topic.id);
        }

        const result: any = {
          topicId: topic.id,
          topicName: topic.name,
          success: true,
          articlesScraped: scrapeResult?.totalArticles || 0,
          sourcesProcessed: scrapeResult?.sourcesProcessed || 0,
          executedAt: now.toISOString()
        };

        if (nextRunAt) {
          result.nextRunAt = nextRunAt.toISOString();
        }

        results.push(result);

        console.log(`✓ ${topic.name}: ${scrapeResult?.totalArticles || 0} articles scraped`);

        } catch (topicError) {
          console.error(`Error processing topic ${topic.name}:`, topicError);
          
          results.push({
            topicId: topic.id,
            topicName: topic.name,
            success: false,
            error: topicError instanceof Error ? topicError.message : String(topicError),
            executedAt: now.toISOString()
          });
        }
    }

    // Log automation event
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Universal topic automation completed',
        context: {
          topicsProcessed: topicsToScrape.length,
          successfulTopics: results.filter(r => r.success).length,
          totalArticles: results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0),
          force,
          dryRun
        },
        function_name: 'universal-topic-automation'
      });

    const successfulTopics = results.filter(r => r.success).length;
    const totalArticles = results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0);

    // Update job run to completed
    if (jobRunId) {
      await supabase
        .from('job_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            topicsProcessed: topicsToScrape.length,
            successfulTopics,
            totalArticles,
            results
          }
        })
        .eq('id', jobRunId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobRunId,
        topicsProcessed: topicsToScrape.length,
        successfulTopics,
        totalArticles,
        results,
        timestamp: now.toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Universal Topic Automation Error:', error);
    
    // Update job run to failed if it exists
    if (jobRunId) {
      try {
        await supabase
          .from('job_runs')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date().toISOString()
          })
          .eq('id', jobRunId);
      } catch (updateError) {
        console.error('Failed to update job run:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});