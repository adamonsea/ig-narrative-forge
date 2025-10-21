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

    // Recover stale processing jobs older than 10 minutes
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: resetStaleError } = await supabase
      .from('content_generation_queue')
      .update({ status: 'pending', started_at: null, error_message: null })
      .eq('status', 'processing')
      .lt('started_at', staleCutoff)
      .lt('attempts', 3);
    if (resetStaleError) {
      console.warn('⚠️ Failed to reset stale jobs:', resetStaleError);
    } else {
      console.log('🧹 Stale processing jobs older than 10m reset to pending');
    }

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

        // Skip if a ready or published story already exists for this article
        let existingStory: any = null;
        let skipReason = '';
        
        // Check both legacy and multi-tenant stories
        if (job.article_id) {
          const { data: legacyStory, error: legacyError } = await supabase
            .from('stories')
            .select('id,status')
            .eq('article_id', job.article_id)
            .in('status', ['ready', 'published', 'draft'])
            .maybeSingle();
          if (legacyError) {
            console.warn('⚠️ Error checking existing legacy story:', legacyError);
          } else if (legacyStory && ['ready', 'published'].includes(legacyStory.status)) {
            existingStory = legacyStory;
            skipReason = `legacy story already ${legacyStory.status}`;
          }
        }
        
        if (!existingStory && job.topic_article_id) {
          const { data: multiTenantStory, error: mtError } = await supabase
            .from('stories')
            .select('id,status')
            .eq('topic_article_id', job.topic_article_id)
            .in('status', ['ready', 'published', 'draft'])
            .maybeSingle();
          if (mtError) {
            console.warn('⚠️ Error checking existing multi-tenant story:', mtError);
          } else if (multiTenantStory && ['ready', 'published'].includes(multiTenantStory.status)) {
            existingStory = multiTenantStory;
            skipReason = `multi-tenant story already ${multiTenantStory.status}`;
          }
        }
        
        // Skip if ready or published story exists
        if (existingStory && ['ready', 'published'].includes(existingStory.status)) {
          const { error: skipError } = await supabase
            .from('content_generation_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              result_data: {
                success: true,
                skipped: true,
                reason: skipReason,
                storyId: existingStory.id
              }
            })
            .eq('id', job.id);
          if (skipError) {
            console.error('❌ Failed to mark job as completed_skipped:', skipError);
          } else {
            console.log(`⏩ Skipped ${jobType} job ${job.id} - ${skipReason} (${existingStory.id})`);
          }
          continue;
        }

        // Prepare generator body with multi-tenant support
        const generatorBody: any = {
          slideType: job.slidetype,
          aiProvider: job.ai_provider || 'deepseek',
          tone: job.tone || 'conversational',
          audienceExpertise: job.writing_style === 'journalistic' ? 'intermediate' : 'beginner'
        };
        
        // Include all relevant IDs for multi-tenant support
        if (job.article_id) {
          generatorBody.articleId = job.article_id;
        }
        if (job.topic_article_id) {
          generatorBody.topicArticleId = job.topic_article_id;
        }
        if (job.shared_content_id) {
          generatorBody.sharedContentId = job.shared_content_id;
        }
        
        console.log(`🚀 Calling enhanced-content-generator for ${jobType} job with IDs:`, {
          articleId: generatorBody.articleId,
          topicArticleId: generatorBody.topicArticleId,
          sharedContentId: generatorBody.sharedContentId,
          slideType: generatorBody.slideType
        });

        const { data: generationResult, error: generationError } = await supabase.functions.invoke('enhanced-content-generator', {
          body: generatorBody
        });

        if (generationError || !generationResult?.success) {
          throw new Error(generationError?.message || generationResult?.error || 'Content generation failed');
        }

        const storyId = generationResult.storyId || generationResult.story_id;
        
        // Auto-approve high-quality stories
        try {
          // Get the story's quality score and topic threshold
          const { data: story, error: storyError } = await supabase
            .from('stories')
            .select('quality_score, article_id, topic_article_id')
            .eq('id', storyId)
            .single();
          
          if (story && !storyError) {
            // Get topic's quality threshold (default 60)
            let qualityThreshold = 60;
            let topicId = null;
            
            // Get topic_id from either legacy or multi-tenant path
            if (story.article_id) {
              const { data: article } = await supabase
                .from('articles')
                .select('topic_id')
                .eq('id', story.article_id)
                .single();
              topicId = article?.topic_id;
            } else if (story.topic_article_id) {
              const { data: topicArticle } = await supabase
                .from('topic_articles')
                .select('topic_id')
                .eq('id', story.topic_article_id)
                .single();
              topicId = topicArticle?.topic_id;
            }
            
            // Get automation threshold if we have a topic
            if (topicId) {
              const { data: automation } = await supabase
                .from('topic_automation_settings')
                .select('quality_threshold')
                .eq('topic_id', topicId)
                .single();
              if (automation?.quality_threshold) {
                qualityThreshold = automation.quality_threshold;
              }
            }
            
            // Auto-approve if quality score meets or exceeds threshold
            if (story.quality_score && story.quality_score >= qualityThreshold) {
              const { error: approveError } = await supabase
                .from('stories')
                .update({ 
                  status: 'ready',
                  updated_at: new Date().toISOString()
                })
                .eq('id', storyId);
              
              if (!approveError) {
                console.log(`🎯 Auto-approved story ${storyId} - quality score ${story.quality_score} >= threshold ${qualityThreshold}`);
              } else {
                console.warn('⚠️ Failed to auto-approve story:', approveError);
              }
            } else {
              console.log(`📝 Story ${storyId} needs review - quality score ${story.quality_score || 'unknown'} < threshold ${qualityThreshold}`);
            }
          }
        } catch (autoApproveError) {
          console.warn('⚠️ Auto-approval check failed:', autoApproveError);
          // Don't fail the job if auto-approval fails
        }
        
        // Mark job as completed with success data
        const { error: completeError } = await supabase
          .from('content_generation_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result_data: {
              success: true,
              storyId: storyId,
              slideCount: generationResult.slideCount || generationResult.slides_count,
              sourceType: generationResult.source_type
            }
          })
          .eq('id', job.id);

        if (completeError) {
          console.error(`Failed to mark job ${job.id} as completed:`, completeError);
        }

        const slideCount = generationResult.slideCount || generationResult.slides_count;
        const contentSource = generationResult.content_source || 'unknown';
        const isSnippet = generationResult.is_snippet || false;
        
        console.log(`✅ Successfully processed ${jobType} job ${job.id} - created ${slideCount} slides from ${contentSource} source${isSnippet ? ' (snippet)' : ''}`);
        
        results.push({
          jobId: job.id,
          articleId: jobIdentifier,
          success: true,
          slideCount: slideCount,
          sourceType: jobType,
          contentSource: contentSource,
          isSnippet: isSnippet
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
              error_message: jobError instanceof Error ? jobError.message : String(jobError),
              result_data: {
                success: false,
                error: jobError instanceof Error ? jobError.message : String(jobError),
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
          error: jobError instanceof Error ? jobError.message : String(jobError),
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
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});