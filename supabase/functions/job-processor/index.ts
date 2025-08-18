import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Job run interface matching our database schema
interface JobRun {
  id: string;
  job_type: string;
  status: string;
  input_data?: any;
  output_data?: any;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

// Rate limiting and cost tracking
const trackApiUsage = async (
  supabase: any,
  serviceName: string,
  operation: string,
  costUsd: number = 0,
  tokensUsed: number = 0,
  jobRunId?: string
) => {
  try {
    await supabase.from('api_usage').insert({
      service_name: serviceName,
      operation: operation,
      cost_usd: costUsd,
      tokens_used: tokensUsed,
      job_run_id: jobRunId,
      region: 'default'
    });
  } catch (error) {
    console.error('Failed to track API usage:', error);
  }
};

const logRequest = async (
  supabase: any,
  requestId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  durationMs: number,
  errorMessage?: string,
  metadata: any = {}
) => {
  try {
    await supabase.from('request_logs').insert({
      request_id: requestId,
      endpoint: endpoint,
      method: method,
      status_code: statusCode,
      duration_ms: durationMs,
      error_message: errorMessage,
      metadata: metadata
    });
  } catch (error) {
    console.error('Failed to log request:', error);
  }
};

serve(async (req) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body to get optional job_type filter
    const { job_type } = await req.json().catch(() => ({}));

    // Log request start
    console.log(`[${requestId}] Job processor started, job_type filter: ${job_type || 'none'}`);

    // Fetch pending jobs from the database
    let query = supabase
      .from('job_runs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    // Apply job_type filter if provided
    if (job_type) {
      query = query.eq('job_type', job_type);
    }

    const { data: jobs, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching jobs:', fetchError);
      const duration = Date.now() - startTime;
      await logRequest(supabase, requestId, 'job-processor', 'POST', 500, duration, fetchError.message);
      
      return new Response(
        JSON.stringify({ error: 'Failed to fetch jobs' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let processedCount = 0;
    let failedCount = 0;

    // Process each job
    for (const job of jobs || []) {
      const jobStartTime = Date.now();
      try {
        console.log(`[${requestId}] Processing job ${job.id} of type ${job.job_type}`);

        // Mark job as running
        await supabase
          .from('job_runs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1
          })
          .eq('id', job.id);

        // Log job start
        await supabase.from('system_logs').insert({
          level: 'info',
          message: `Job ${job.id} started processing`,
          context: { 
            job_id: job.id, 
            job_type: job.job_type, 
            attempt: job.attempts + 1,
            request_id: requestId
          },
          function_name: 'job-processor',
          request_id: requestId
        });

        // Process the job based on its type
        const result = await processJob(job, supabase, requestId);

        // Mark job as completed
        await supabase
          .from('job_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: result
          })
          .eq('id', job.id);

        // Log job completion
        const jobDuration = Date.now() - jobStartTime;
        await supabase.from('system_logs').insert({
          level: 'info',
          message: `Job ${job.id} completed successfully in ${jobDuration}ms`,
          context: { 
            job_id: job.id, 
            job_type: job.job_type, 
            result,
            duration_ms: jobDuration,
            request_id: requestId
          },
          function_name: 'job-processor',
          request_id: requestId
        });

        processedCount++;

      } catch (error) {
        console.error(`[${requestId}] Error processing job ${job.id}:`, error);
        failedCount++;

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const nextAttempt = job.attempts + 1;
        const jobDuration = Date.now() - jobStartTime;

        if (nextAttempt >= job.max_attempts) {
          // Mark job as failed if max attempts reached
          await supabase
            .from('job_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: errorMessage
            })
            .eq('id', job.id);
        } else {
          // Schedule retry with exponential backoff
          const backoffMinutes = Math.pow(2, nextAttempt) * 5; // 5, 10, 20 minutes
          const nextScheduledAt = new Date(Date.now() + backoffMinutes * 60000).toISOString();

          await supabase
            .from('job_runs')
            .update({
              status: 'pending',
              error_message: errorMessage,
              scheduled_at: nextScheduledAt
            })
            .eq('id', job.id);
        }

        // Log job failure
        await supabase.from('system_logs').insert({
          level: 'error',
          message: `Job ${job.id} failed: ${errorMessage}`,
          context: { 
            job_id: job.id, 
            job_type: job.job_type, 
            attempt: nextAttempt, 
            will_retry: nextAttempt < job.max_attempts,
            duration_ms: jobDuration,
            request_id: requestId,
            error: errorMessage
          },
          function_name: 'job-processor',
          request_id: requestId
        });
      }
    }

    // Log processing summary
    const totalDuration = Date.now() - startTime;
    await supabase.from('system_logs').insert({
      level: 'info',
      message: `Job processing completed: ${processedCount} processed, ${failedCount} failed in ${totalDuration}ms`,
      context: { 
        processed_count: processedCount, 
        failed_count: failedCount,
        total_jobs: jobs?.length || 0,
        duration_ms: totalDuration,
        request_id: requestId
      },
      function_name: 'job-processor',
      request_id: requestId
    });

    // Log successful request
    await logRequest(supabase, requestId, 'job-processor', 'POST', 200, totalDuration);

    return new Response(
      JSON.stringify({
        message: 'Job processing completed',
        processed: processedCount,
        failed: failedCount,
        total: jobs?.length || 0,
        duration_ms: totalDuration,
        request_id: requestId
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Unexpected error in job processor:`, error);
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to log the error, but don't fail if logging fails
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await logRequest(supabase, requestId, 'job-processor', 'POST', 500, duration, errorMessage);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: errorMessage,
        request_id: requestId
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Process individual jobs based on type
async function processJob(job: JobRun, supabase: any, requestId: string): Promise<any> {
  switch (job.job_type) {
    case 'scrape':
      return await processScrapeJob(job, supabase, requestId);
    case 'ai_summary':
      return await processAISummaryJob(job, supabase, requestId);
    case 'visual_gen':
      return await processVisualGenJob(job, supabase, requestId);
    case 'publish':
      return await processPublishJob(job, supabase, requestId);
    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

// Placeholder implementations for different job types
async function processScrapeJob(job: JobRun, supabase: any, requestId: string): Promise<any> {
  // TODO: Implement RSS/API scraping logic
  console.log(`[${requestId}] Processing scrape job:`, job.id);
  
  // Track API usage for demonstration
  await trackApiUsage(supabase, 'rss-scraper', 'fetch_articles', 0.001, 0, job.id);
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const articlesScraped = Math.floor(Math.random() * 10) + 1;
  
  return {
    success: true,
    articles_scraped: articlesScraped,
    message: 'Mock scrape completed'
  };
}

async function processAISummaryJob(job: JobRun, supabase: any, requestId: string): Promise<any> {
  // TODO: Implement AI content rewriting logic
  console.log(`[${requestId}] Processing AI summary job:`, job.id);
  
  // Simulate AI API costs
  const tokensUsed = Math.floor(Math.random() * 5000) + 1000;
  const costUsd = (tokensUsed / 1000) * 0.002; // Mock cost calculation
  
  await trackApiUsage(supabase, 'openai', 'text_generation', costUsd, tokensUsed, job.id);
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const slidesGenerated = Math.floor(Math.random() * 7) + 4;
  
  return {
    success: true,
    slides_generated: slidesGenerated,
    tokens_used: tokensUsed,
    cost_usd: costUsd,
    message: 'Mock AI summary completed'
  };
}

async function processVisualGenJob(job: JobRun, supabase: any, requestId: string): Promise<any> {
  // TODO: Implement visual generation logic
  console.log(`[${requestId}] Processing visual generation job:`, job.id);
  
  // Simulate image generation costs
  const imagesGenerated = Math.floor(Math.random() * 5) + 1;
  const costUsd = imagesGenerated * 0.04; // Mock cost per image
  
  await trackApiUsage(supabase, 'stability-ai', 'image_generation', costUsd, 0, job.id);
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    success: true,
    visuals_generated: imagesGenerated,
    cost_usd: costUsd,
    message: 'Mock visual generation completed'
  };
}

async function processPublishJob(job: JobRun, supabase: any, requestId: string): Promise<any> {
  // TODO: Implement Buffer/social media publishing logic
  console.log(`[${requestId}] Processing publish job:`, job.id);
  
  // Track API usage for social media posting
  await trackApiUsage(supabase, 'buffer', 'post_content', 0.01, 0, job.id);
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return {
    success: true,
    platforms_published: ['instagram', 'twitter'],
    message: 'Mock publish completed'
  };
}