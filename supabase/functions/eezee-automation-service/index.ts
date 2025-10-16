import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationRequest {
  userId?: string;
  forceRun?: boolean;
  dryRun?: boolean;
  targetTopics?: string[];
}

interface CoverCandidate {
  topicId: string;
  topicName: string;
  topicArticleId: string;
  qualityScore: number;
}

// Function to check if user is superadmin
async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'superadmin')
      .single();
    
    return !error && data !== null;
  } catch (error) {
    console.log('Error checking superadmin status:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('🤖 Starting eezee News Automation Service...');
    const startTime = Date.now();
    
    const { userId, forceRun = false, dryRun = false, targetTopics = [] } = await req.json() as AutomationRequest;

    // Phase 1: Global Automation Check
    console.log('📋 Checking global automation settings...');
    
    const { data: settingsData, error: settingsError } = await supabase
      .from('scheduler_settings')
      .select('setting_value')
      .eq('setting_key', 'automation_config')
      .single();

    if (settingsError) {
      console.log('⏭️ No automation configuration found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No automation configuration found',
        processed_users: 0,
        total_articles_gathered: 0,
        total_stories_generated: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const defaultAutomationConfig = {
      enabled: false,
      scrape_frequency_hours: 12,
      auto_simplify_enabled: true,
      auto_simplify_quality_threshold: 60,
      auto_cover_enabled: false,
      auto_cover_quality_threshold: 75,
      auto_cover_generation_rate: 0.4,
      auto_cover_daily_cap: 6,
      auto_cover_model: 'gpt-image-1'
    };

    const automationConfig = {
      ...defaultAutomationConfig,
      ...(settingsData?.setting_value as Record<string, unknown> ?? {})
    } as typeof defaultAutomationConfig & Record<string, unknown>;
    if (!automationConfig?.enabled) {
      // Check if requester is superadmin - allow bypass for superadmins
      const isSuperAdminUser = userId ? await isSuperAdmin(supabase, userId) : false;
      
      if (!isSuperAdminUser) {
        console.log('⏭️ Global automation is disabled and user is not superadmin');
        return new Response(JSON.stringify({
          success: true,
          message: 'Global automation is disabled',
          processed_users: 0,
          total_articles_gathered: 0,
          total_stories_generated: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log('🔓 Global automation disabled but allowing superadmin bypass');
      }
    }

    console.log('✅ Global automation is enabled, proceeding...');
    
    let totalArticlesGathered = 0;
    let totalStoriesGenerated = 0;
    let processedUsers = 0;
    let totalCoverCandidates = 0;
    let totalCoverAttempts = 0;
    let totalCoversGenerated = 0;
    const userResults: any[] = [];
    const automationIllustrationSecret = Deno.env.get('AUTOMATION_STORY_ILLUSTRATION_SECRET') || '';

    // Phase 2: Process User's Automation (or target user if specified)
    const targetUserId = userId || null;
    try {
      console.log(`👤 Processing automation...`);
      
      // Get active topics with automation enabled
      let topicsQuery = supabase
        .from('topics')
        .select(`
          id,
          name,
          created_by,
          is_active,
          auto_simplify_enabled,
          automation_quality_threshold,
          topic_automation_settings (
            scrape_frequency_hours,
            is_active,
            last_run_at,
            next_run_at
          )
        `)
        .eq('is_active', true);

      if (targetUserId) {
        topicsQuery = topicsQuery.eq('created_by', targetUserId);
      }

      if (targetTopics.length > 0) {
        topicsQuery = topicsQuery.in('id', targetTopics);
      }

      const { data: topics, error: topicsError } = await topicsQuery;
      
      if (topicsError) {
        throw new Error(`Failed to get topics: ${topicsError.message}`);
      }

      if (!topics || topics.length === 0) {
        console.log(`⏭️ No active topics found`);
        return new Response(JSON.stringify({
          success: true,
          message: 'No active topics found',
          processed_users: 0,
          total_articles_gathered: 0,
          total_stories_generated: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Filter topics that are due for scraping
      const now = new Date();
      const topicsToScrape = topics.filter(topic => {
        if (!topic.topic_automation_settings?.[0]?.is_active) {
          return false;
        }

        const automationSettings = topic.topic_automation_settings[0];
        
        if (forceRun) {
          return true;
        }

        // Check if it's time to scrape based on global or topic-specific frequency
        const frequencyHours = automationSettings.scrape_frequency_hours || automationConfig.scrape_frequency_hours || 12;
        const nextRunAt = new Date(automationSettings.next_run_at);
        const shouldRun = now >= nextRunAt;

        console.log(`🔍 Topic "${topic.name}": Next run at ${nextRunAt.toISOString()}, should run: ${shouldRun}`);
        return shouldRun;
      });

      console.log(`📊 Found ${topicsToScrape.length} topics ready for scraping`);

      if (dryRun) {
        userResults.push({
          userId: targetUserId || 'global',
          topicsToScrape: topicsToScrape.map(t => ({
            id: t.id,
            name: t.name,
            nextRunAt: t.topic_automation_settings[0]?.next_run_at,
            frequency: t.topic_automation_settings[0]?.scrape_frequency_hours || automationConfig.scrape_frequency_hours || 12
          })),
          articlesGathered: 0,
          storiesGenerated: 0
        });
        
        return new Response(JSON.stringify({
          success: true,
          dryRun: true,
          user_results: userResults
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let userArticlesGathered = 0;
      let userStoriesGenerated = 0;
      let userCoverAttempts = 0;
      let userCoversGenerated = 0;
      const coverCandidates: CoverCandidate[] = [];

      // Phase 3: Scrape Topics
      for (const topic of topicsToScrape) {
        try {
          console.log(`🎯 Scraping topic: ${topic.name}`);

          // Call universal topic scraper
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
            console.error(`❌ Scraping failed for topic ${topic.name}:`, scrapeError);
            continue;
          }

          const articlesScraped = scrapeResult?.totalArticles || 0;
          userArticlesGathered += articlesScraped;

          // Update topic automation settings
          const automationSettings = topic.topic_automation_settings[0];
          const frequencyHours = automationSettings.scrape_frequency_hours || automationConfig.scrape_frequency_hours || 12;
          const nextRunAt = new Date(now.getTime() + (frequencyHours * 60 * 60 * 1000));

          await supabase
            .from('topic_automation_settings')
            .update({
              last_run_at: now.toISOString(),
              next_run_at: nextRunAt.toISOString(),
              updated_at: now.toISOString()
            })
            .eq('topic_id', topic.id);

          console.log(`✅ ${topic.name}: ${articlesScraped} articles scraped, next run: ${nextRunAt.toISOString()}`);

          // Phase 4: Auto-Simplification (if enabled)
          if (topic.auto_simplify_enabled && automationConfig.auto_simplify_enabled) {
            try {
              console.log(`🎨 Starting auto-simplification for topic: ${topic.name}`);

              const qualityThreshold = topic.automation_quality_threshold || automationConfig.auto_simplify_quality_threshold || 60;
              const coverQualityThreshold = Math.max(
                qualityThreshold,
                Number(automationConfig.auto_cover_quality_threshold ?? qualityThreshold)
              );

              // Get new articles that meet quality threshold and aren't already processed
              const { data: eligibleArticles, error: articlesError } = await supabase
                .from('topic_articles')
                .select(`
                  id,
                  shared_content_id,
                  content_quality_score,
                  shared_article_content!inner(title, word_count)
                `)
                .eq('topic_id', topic.id)
                .eq('processing_status', 'new')
                .gte('content_quality_score', qualityThreshold)
                .gte('shared_article_content.word_count', 150)
                .limit(5); // Process max 5 articles per topic per run

              if (articlesError) {
                console.error(`❌ Error fetching eligible articles for ${topic.name}:`, articlesError);
                continue;
              }

              if (!eligibleArticles || eligibleArticles.length === 0) {
                console.log(`📭 No eligible articles for auto-simplification in ${topic.name}`);
                continue;
              }

              console.log(`📝 Found ${eligibleArticles.length} articles eligible for auto-simplification in ${topic.name}`);

              // Add to content generation queue
              for (const article of eligibleArticles) {
                try {
                  // Check if already in queue
                  const { data: existingQueue } = await supabase
                    .from('content_generation_queue')
                    .select('id')
                    .eq('topic_article_id', article.id)
                    .eq('status', 'pending')
                    .single();

                  if (existingQueue) {
                    console.log(`⏭️ Article already in queue: ${(article.shared_article_content as any)?.title || 'Unknown Title'}`);
                    continue;
                  }

                  // Add to queue
                  const { error: queueError } = await supabase
                    .from('content_generation_queue')
                    .insert({
                      topic_article_id: article.id,
                      shared_content_id: article.shared_content_id,
                      slidetype: 'tabloid',
                      status: 'pending',
                      ai_provider: 'deepseek',
                      tone: 'conversational',
                      audience_expertise: 'intermediate',
                      writing_style: 'journalistic'
                    });

                  if (queueError) {
                    console.error(`❌ Error adding article to queue:`, queueError);
                    continue;
                  }

                  if (automationConfig.auto_cover_enabled) {
                    const articleQuality = article.content_quality_score ?? 0;
                    if (articleQuality >= coverQualityThreshold) {
                      coverCandidates.push({
                        topicId: topic.id,
                        topicName: topic.name,
                        topicArticleId: article.id,
                        qualityScore: articleQuality
                      });
                    }
                  }

                  // Mark article as processed
                  await supabase
                    .from('topic_articles')
                    .update({
                      processing_status: 'processed',
                      updated_at: now.toISOString()
                    })
                    .eq('id', article.id);

                  userStoriesGenerated++;
                  console.log(`✅ Queued for simplification: ${(article.shared_article_content as any)?.title || 'Unknown Title'}`);

                } catch (articleError) {
                  console.error(`❌ Error processing article ${article.id}:`, articleError);
                }
              }

            } catch (simplifyError) {
              console.error(`❌ Auto-simplification failed for topic ${topic.name}:`, simplifyError);
            }
          }

        } catch (topicError) {
          console.error(`❌ Error processing topic ${topic.name}:`, topicError);
        }
      }

      userResults.push({
        userId: targetUserId || 'global',
        topicsProcessed: topicsToScrape.length,
        articlesGathered: userArticlesGathered,
        storiesGenerated: userStoriesGenerated,
        coverCandidates: coverCandidates.length,
        coverAttempts: userCoverAttempts,
        coversGenerated: userCoversGenerated,
        success: true
      });

      totalArticlesGathered += userArticlesGathered;
      totalStoriesGenerated += userStoriesGenerated;
      processedUsers = 1;

      console.log(`✅ Automation complete: ${userArticlesGathered} articles gathered, ${userStoriesGenerated} stories queued`);

    } catch (automationError) {
      console.error(`❌ Error processing automation:`, automationError);
      userResults.push({
        userId: targetUserId || 'global',
        success: false,
        error: automationError instanceof Error ? automationError.message : String(automationError)
      });
    }

    // Phase 5: Process Content Generation Queue
    if (!dryRun && totalStoriesGenerated > 0) {
      console.log('🔄 Processing content generation queue...');
      try {
        const queueResponse = await supabase.functions.invoke('queue-processor', {});
        if (queueResponse.data?.success) {
          console.log(`✅ Queue processor completed: ${queueResponse.data.processed || 0} jobs processed`);
        }
      } catch (queueError) {
        console.error('❌ Queue processor error:', queueError);
      }
    }

    // Phase 6: Auto-generate covers for high quality stories
    totalCoverCandidates += coverCandidates.length;

    if (!dryRun && automationConfig.auto_cover_enabled && coverCandidates.length > 0) {
      if (!automationIllustrationSecret) {
        console.warn('⚠️ Skipping automated cover generation - automation secret not configured');
      } else {
        const sortedCandidates = [...coverCandidates].sort((a, b) => b.qualityScore - a.qualityScore);
        const coverRate = Math.min(Math.max(Number(automationConfig.auto_cover_generation_rate ?? 0.4), 0), 1);
        let plannedCount = Math.round(sortedCandidates.length * coverRate);

        if (plannedCount === 0 && coverRate > 0 && sortedCandidates.length > 0) {
          plannedCount = 1;
        }

        const dailyCapRaw = Number(automationConfig.auto_cover_daily_cap ?? sortedCandidates.length);
        if (Number.isFinite(dailyCapRaw) && dailyCapRaw > 0) {
          plannedCount = Math.min(plannedCount, dailyCapRaw);
        }

        plannedCount = Math.min(plannedCount, sortedCandidates.length);

        if (plannedCount > 0) {
          console.log(`🎨 Attempting automated cover generation for ${plannedCount} of ${coverCandidates.length} candidates`);
        }

        const selectedCandidates = sortedCandidates.slice(0, plannedCount);

        for (const candidate of selectedCandidates) {
          userCoverAttempts++;
          totalCoverAttempts++;

          try {
            const { data: storyRecord, error: storyError } = await supabase
              .from('stories')
              .select('id, cover_illustration_url, selected_cover_id, status, title')
              .eq('topic_article_id', candidate.topicArticleId)
              .order('created_at', { ascending: false })
              .maybeSingle();

            if (storyError) {
              console.error(`❌ Failed to load story for cover automation (${candidate.topicArticleId}):`, storyError);
              continue;
            }

            if (!storyRecord) {
              console.warn(`⚠️ No story found for topic_article ${candidate.topicArticleId}, skipping cover generation`);
              continue;
            }

            if (storyRecord.cover_illustration_url) {
              console.log(`⏭️ Story ${storyRecord.id} already has a cover, skipping automation`);
              continue;
            }

            const { data: illustrationResult, error: illustrationError } = await supabase.functions.invoke('story-illustrator', {
              body: {
                storyId: storyRecord.id,
                model: String(automationConfig.auto_cover_model || 'gpt-image-1'),
                automationSecret: automationIllustrationSecret,
                autoSelectCover: true
              }
            });

            if (illustrationError || !illustrationResult?.success) {
              console.error('❌ Automated cover generation failed:', illustrationError || illustrationResult?.error);
              continue;
            }

            userCoversGenerated++;
            totalCoversGenerated++;
            console.log(`🖼️ Automated cover generated for story ${storyRecord.id}`);
          } catch (coverError) {
            console.error('❌ Unexpected error during automated cover generation:', coverError);
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      dryRun,
      duration_ms: duration,
      processed_users: processedUsers,
      total_articles_gathered: totalArticlesGathered,
      total_stories_generated: totalStoriesGenerated,
      total_cover_candidates: totalCoverCandidates,
      total_cover_attempts: totalCoverAttempts,
      total_covers_generated: totalCoversGenerated,
      user_results: userResults,
      next_automation_run: new Date(Date.now() + (12 * 60 * 60 * 1000)).toISOString(), // 12 hours from now
      timestamp: new Date().toISOString()
    };

    console.log('🎉 eezee News Automation Service completed:', summary);

    // Log the automation run
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `eezee News Automation Service completed: ${processedUsers} users processed, ${totalArticlesGathered} articles gathered, ${totalStoriesGenerated} stories queued, ${totalCoversGenerated} covers generated`,
        context: summary,
        function_name: 'eezee-automation-service'
      });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 eezee News Automation Service error:', error);
    
    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now(),
      processed_users: 0,
      total_articles_gathered: 0,
      total_stories_generated: 0,
      total_cover_candidates: 0,
      total_cover_attempts: 0,
      total_covers_generated: 0,
      timestamp: new Date().toISOString()
    };

    // Log the error
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `eezee News Automation Service failed: ${error instanceof Error ? error.message : String(error)}`,
          context: errorResponse,
          function_name: 'eezee-automation-service'
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