import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueJob {
  id: string;
  article_id: string | null;
  topic_article_id: string | null;
  shared_content_id: string | null;
  slidetype: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  ai_provider?: string;
  tone?: string;
  writing_style?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔄 Starting queue processing...');

    // Get pending jobs from the queue (limit to 5 at a time for better efficiency)
    const { data: pendingJobs, error: queueError } = await supabase
      .from('content_generation_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3) // Don't retry failed jobs too many times
      .order('created_at', { ascending: true })
      .limit(5);

    if (queueError) {
      console.error('Error fetching queue:', queueError);
      throw queueError;
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('✅ No pending jobs in queue');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No pending jobs',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Found ${pendingJobs.length} pending jobs`);

    const results = [];
    
    // Process each job sequentially to avoid conflicts
    for (const job of pendingJobs) {
      const jobType = job.article_id ? 'legacy' : 'multi-tenant';
      const jobIdentifier = job.article_id || job.topic_article_id;
      
      console.log(`🚀 Processing ${jobType} job ${job.id} for article ${jobIdentifier}`);
      
      try {
        // Mark job as processing
        const { error: updateError } = await supabase
          .from('content_generation_queue')
          .update({ 
            status: 'processing',
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1
          })
          .eq('id', job.id);

        if (updateError) {
          console.error(`Failed to update job ${job.id}:`, updateError);
          continue;
        }

        // Call the enhanced-content-generator function (only supports legacy articles for now)
        if (!job.article_id) {
          throw new Error('Enhanced content generator currently only supports legacy articles');
        }

        const generatorBody = {
          articleId: job.article_id,
          slideType: job.slidetype,
          aiProvider: job.ai_provider || 'deepseek',
          tone: job.tone || 'conversational',
          audienceExpertise: job.writing_style === 'journalistic' ? 'intermediate' : 'beginner'
        };

        const { data: generationResult, error: generationError } = await supabase.functions.invoke('enhanced-content-generator', {
          body: generatorBody
        });

        if (generationError || !generationResult?.success) {
          throw new Error(generationError?.message || generationResult?.error || 'Content generation failed');
        }

        // Mark job as completed with success data
        const { error: completeError } = await supabase
          .from('content_generation_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result_data: {
              success: true,
              storyId: generationResult.storyId || generationResult.story_id,
              slideCount: generationResult.slideCount || generationResult.slides_count,
              sourceType: generationResult.source_type
            }
          })
          .eq('id', job.id);

        if (completeError) {
          console.error(`Failed to mark job ${job.id} as completed:`, completeError);
        }

        console.log(`✅ Successfully processed ${jobType} job ${job.id} - created ${generationResult.slideCount || generationResult.slides_count} slides`);
        
        results.push({
          jobId: job.id,
          articleId: jobIdentifier,
          success: true,
          slideCount: generationResult.slideCount || generationResult.slides_count,
          sourceType: jobType
        });

      } catch (jobError) {
        console.error(`❌ Error processing ${jobType} job ${job.id}:`, jobError);
        
        // Implement exponential backoff for retries
        const nextAttemptDelay = Math.pow(2, job.attempts) * 60000; // 1min, 2min, 4min, etc.
        const shouldRetry = job.attempts < job.max_attempts;
        
        if (shouldRetry) {
          // Mark for retry with backoff
          const { error: retryError } = await supabase
            .from('content_generation_queue')
            .update({
              status: 'pending',
              error_message: jobError.message,
              result_data: {
                success: false,
                error: jobError.message,
                retry_scheduled_for: new Date(Date.now() + nextAttemptDelay).toISOString()
              }
            })
            .eq('id', job.id);
            
          if (!retryError) {
            console.log(`🔄 Job ${job.id} scheduled for retry in ${nextAttemptDelay/1000/60} minutes`);
          }
        } else {
          // Return article to pipeline after max attempts instead of marking as failed
          console.log(`♻️ ${jobType} Job ${job.id} failed after ${job.attempts} attempts - returning article to pipeline`);
          
          // Delete the failed job from queue
          const { error: deleteError } = await supabase
            .from('content_generation_queue')
            .delete()
            .eq('id', job.id);
            
          // Reset appropriate article status back to 'new' so it appears in pipeline again
          if (job.article_id) {
            // Legacy article
            const { error: resetArticleError } = await supabase
              .from('articles')
              .update({
                processing_status: 'new',
                updated_at: new Date().toISOString()
              })
              .eq('id', job.article_id);
              
            if (!deleteError && !resetArticleError) {
              console.log(`✅ Successfully returned legacy article ${job.article_id} to pipeline after ${job.attempts} failed attempts`);
            } else {
              console.error(`❌ Failed to return legacy article to pipeline:`, deleteError || resetArticleError);
            }
          } else if (job.topic_article_id) {
            // Multi-tenant article
            const { error: resetArticleError } = await supabase
              .from('topic_articles')
              .update({
                processing_status: 'new',
                updated_at: new Date().toISOString()
              })
              .eq('id', job.topic_article_id);
              
            if (!deleteError && !resetArticleError) {
              console.log(`✅ Successfully returned multi-tenant article ${job.topic_article_id} to pipeline after ${job.attempts} failed attempts`);
            } else {
              console.error(`❌ Failed to return multi-tenant article to pipeline:`, deleteError || resetArticleError);
            }
          }
        }

        results.push({
          jobId: job.id,
          articleId: jobIdentifier,
          success: false,
          error: jobError.message,
          sourceType: jobType
        });
      }

      // Small delay between jobs to prevent overload
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`🏁 Queue processing complete. Processed ${results.length} jobs.`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Queue processor error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});