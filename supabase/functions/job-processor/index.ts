import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JobRun {
  id: string;
  job_type: string;
  status: string;
  input_data: any;
  output_data: any;
  error_message?: string;
  attempts: number;
  max_attempts: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { job_type } = await req.json();
    const requestId = crypto.randomUUID();

    // Log job processor request
    await supabase.from('system_logs').insert({
      request_id: requestId,
      level: 'info',
      message: `Processing jobs for type: ${job_type || 'all'}`,
      context: { job_type },
      function_name: 'job-processor'
    });

    // Get pending jobs
    let query = supabase
      .from('job_runs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(10);

    if (job_type) {
      query = query.eq('job_type', job_type);
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No pending jobs found', 
          processed: 0,
          requestId 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let failed = 0;

    // Process each job
    for (const job of jobs) {
      try {
        // Mark job as running
        await supabase
          .from('job_runs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1
          })
          .eq('id', job.id);

        // Process the job based on type
        const result = await processJob(job, supabase);

        // Mark job as completed
        await supabase
          .from('job_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: result
          })
          .eq('id', job.id);

        processed++;

        // Log success
        await supabase.from('system_logs').insert({
          request_id: requestId,
          level: 'info',
          message: `Job completed successfully: ${job.job_type}`,
          context: { job_id: job.id, result },
          function_name: 'job-processor'
        });

      } catch (jobError) {
        failed++;
        const shouldRetry = job.attempts < job.max_attempts;
        
        // Update job status
        await supabase
          .from('job_runs')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            error_message: jobError.message,
            completed_at: shouldRetry ? null : new Date().toISOString(),
            scheduled_at: shouldRetry 
              ? new Date(Date.now() + (job.attempts * 60000)).toISOString() // Exponential backoff
              : null
          })
          .eq('id', job.id);

        // Log error
        await supabase.from('system_logs').insert({
          request_id: requestId,
          level: 'error',
          message: `Job failed: ${job.job_type} - ${jobError.message}`,
          context: { 
            job_id: job.id, 
            error: jobError.message,
            will_retry: shouldRetry 
          },
          function_name: 'job-processor'
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Processed ${processed} jobs, ${failed} failed`,
        processed,
        failed,
        requestId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Job processor error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Job processor failed', 
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function processJob(job: JobRun, supabase: any): Promise<any> {
  const { job_type, input_data } = job;

  switch (job_type) {
    case 'scraper':
      return await processScrapeJob(input_data, supabase);
    
    case 'ai_summarize':
      return await processAISummaryJob(input_data, supabase);
    
    case 'visual_gen':
      return await processVisualGenJob(input_data, supabase);
    
    case 'publish':
      return await processPublishJob(input_data, supabase);
    
    default:
      throw new Error(`Unknown job type: ${job_type}`);
  }
}

async function processScrapeJob(input: any, supabase: any): Promise<any> {
  // Placeholder for scraping logic
  console.log('Processing scrape job:', input);
  return { status: 'scraped', url: input.url, timestamp: new Date().toISOString() };
}

async function processAISummaryJob(input: any, supabase: any): Promise<any> {
  // Placeholder for AI summary logic
  console.log('Processing AI summary job:', input);
  return { status: 'summarized', article_id: input.article_id, slides_created: 5 };
}

async function processVisualGenJob(input: any, supabase: any): Promise<any> {
  // Placeholder for visual generation logic
  console.log('Processing visual generation job:', input);
  return { status: 'visuals_generated', slide_id: input.slide_id, image_url: 'placeholder.jpg' };
}

async function processPublishJob(input: any, supabase: any): Promise<any> {
  // Placeholder for publishing logic
  console.log('Processing publish job:', input);
  return { status: 'published', post_id: input.post_id, platforms: input.platforms };
}