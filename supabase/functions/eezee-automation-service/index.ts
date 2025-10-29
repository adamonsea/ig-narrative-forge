import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

    const automationConfig = settingsData?.setting_value as any;
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
    const userResults: any[] = [];

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
          region,
          parliamentary_tracking_enabled,
          parliamentary_last_collection_at,
          parliamentary_last_weekly_roundup_at,
          auto_simplify_enabled,
          automation_quality_threshold,
          topic_automation_settings (
            scrape_frequency_hours,
            is_active,
            automation_mode,
            quality_threshold,
            illustration_quality_threshold,
            auto_illustrate_enabled,
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

      // Phase 3: Process Topics Based on Automation Mode
      for (const topic of topicsToScrape) {
        const automationSettings = topic.topic_automation_settings[0];
        const automationMode = automationSettings?.automation_mode || 'manual';
        
        console.log(`🎯 Processing topic: ${topic.name} (mode: ${automationMode})`);
        
        // Skip if manual mode
        if (automationMode === 'manual') {
          console.log(`⏭️ Skipping ${topic.name} - manual mode enabled`);
          continue;
        }

        try {
          // Phase 3a: Scrape Articles (if auto_gather or holiday mode)
          if (automationMode === 'auto_gather' || automationMode === 'holiday') {
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
          } catch (scrapeError) {
            console.error(`❌ Scraping failed for topic ${topic.name}:`, scrapeError);
          }
        } // End auto_gather check

          // Phase 3b: Auto-Simplification (if auto_simplify or holiday mode)
          if ((automationMode === 'auto_simplify' || automationMode === 'holiday') && automationConfig.auto_simplify_enabled) {
            try {
              console.log(`🎨 Starting auto-simplification for topic: ${topic.name}`);

              const qualityThreshold = topic.automation_quality_threshold || automationConfig.auto_simplify_quality_threshold || 60;

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
          } // End auto_simplify check

          // Phase 3c: Auto-Illustration (if auto_illustrate or holiday mode)
          if (automationMode === 'auto_illustrate' || automationMode === 'holiday') {
            try {
              console.log(`🎨 Starting auto-illustration for topic: ${topic.name}`);

              const { data: illustrationResult, error: illustrationError } = await supabase.functions.invoke(
                'auto-illustrate-stories',
                {
                  body: {
                    topicId: topic.id,
                    maxIllustrations: 5
                  }
                }
              );

              if (illustrationError) {
                console.error(`❌ Auto-illustration failed for ${topic.name}:`, illustrationError);
              } else {
                console.log(`✅ ${topic.name}: ${illustrationResult?.successCount || 0} illustrations generated`);
              }

            } catch (illustrationError) {
              console.error(`❌ Auto-illustration error for topic ${topic.name}:`, illustrationError);
            }
          } // End auto_illustrate check

        } catch (topicError) {
          console.error(`❌ Error processing topic ${topic.name}:`, topicError);
        }
      }

      userResults.push({
        userId: targetUserId || 'global',
        topicsProcessed: topicsToScrape.length,
        articlesGathered: userArticlesGathered,
        storiesGenerated: userStoriesGenerated,
        success: true
      });

      totalArticlesGathered += userArticlesGathered;
      totalStoriesGenerated += userStoriesGenerated;
      processedUsers = 1;

      console.log(`✅ Automation complete: ${userArticlesGathered} articles gathered, ${userStoriesGenerated} stories queued`);

    } catch (automationError) {
      const errorMessage = automationError instanceof Error ? automationError.message : String(automationError);
      const errorStack = automationError instanceof Error ? automationError.stack : undefined;
      
      console.error(`❌ Error processing automation:`, {
        error: errorMessage,
        stack: errorStack,
        userId: targetUserId,
        targetTopics,
        forceRun,
        dryRun
      });
      
      // Enhanced error logging
      await supabase.from('system_logs').insert({
        log_type: 'automation_error',
        message: `Automation service failed for user ${targetUserId || 'global'}`,
        metadata: {
          error: errorMessage,
          stack: errorStack,
          userId: targetUserId,
          targetTopics,
          forceRun,
          dryRun,
          timestamp: new Date().toISOString()
        }
      }).catch(logErr => console.error('Failed to log error:', logErr));
      
      userResults.push({
        userId: targetUserId || 'global',
        success: false,
        error: errorMessage,
        errorDetails: {
          stack: errorStack,
          targetTopics,
          forceRun,
          dryRun
        }
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

    // Phase 6: Parliamentary Automation
    if (!dryRun) {
      console.log('🏛️ Processing parliamentary automation...');
      for (const topic of topics || []) {
        if (!topic.parliamentary_tracking_enabled || !topic.region) {
          continue;
        }
        
        try {
          // Check if it's been 6+ hours since last collection
          const lastCollection = topic.parliamentary_last_collection_at;
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
          
          if (!lastCollection || new Date(lastCollection) < sixHoursAgo || forceRun) {
            console.log(`📊 Collecting parliamentary votes for ${topic.name}...`);
            
            const { error: collectionError } = await supabase.functions.invoke('uk-parliament-collector', {
              body: {
                topicId: topic.id,
                region: topic.region,
                mode: 'daily'
              }
            });
            
            if (collectionError) {
              console.error(`❌ Error collecting votes for ${topic.name}:`, collectionError);
            } else {
              // Update last collection timestamp
              await supabase
                .from('topics')
                .update({ parliamentary_last_collection_at: new Date().toISOString() })
                .eq('id', topic.id);
              
              console.log(`✅ Parliamentary votes collected for ${topic.name}`);
            }
          }
          
          // Check if it's Monday 9am-10am for weekly roundup
          const now = new Date();
          const isMonday = now.getDay() === 1;
          const isMorning = now.getHours() >= 9 && now.getHours() < 10;
          const lastWeeklyRoundup = topic.parliamentary_last_weekly_roundup_at;
          const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          if ((isMonday && isMorning && (!lastWeeklyRoundup || new Date(lastWeeklyRoundup) < lastWeek)) || forceRun) {
            console.log(`📅 Creating weekly parliamentary roundup for ${topic.name}...`);
            
            const { error: roundupError } = await supabase.functions.invoke('uk-parliament-collector', {
              body: {
                topicId: topic.id,
                region: topic.region,
                mode: 'weekly'
              }
            });
            
            if (roundupError) {
              console.error(`❌ Error creating weekly roundup for ${topic.name}:`, roundupError);
            } else {
              // Update last weekly roundup timestamp
              await supabase
                .from('topics')
                .update({ parliamentary_last_weekly_roundup_at: new Date().toISOString() })
                .eq('id', topic.id);
              
              console.log(`✅ Weekly parliamentary roundup created for ${topic.name}`);
            }
          }
        } catch (parlError) {
          console.error(`❌ Parliamentary automation error for ${topic.name}:`, parlError);
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
        message: `eezee News Automation Service completed: ${processedUsers} users processed, ${totalArticlesGathered} articles gathered, ${totalStoriesGenerated} stories queued`,
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
      timestamp: new Date().toISOString()
    };

    // Log the error with enhanced context
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `eezee News Automation Service failed: ${error instanceof Error ? error.message : String(error)}`,
          context: {
            ...errorResponse,
            stack: error instanceof Error ? error.stack : undefined,
            error_category: error instanceof Error && error.message.includes('automation_config') ? 'config_error' :
                           error instanceof Error && error.message.includes('topics') ? 'topic_error' :
                           error instanceof Error && error.message.includes('scrape') ? 'scraper_error' :
                           'unknown'
          },
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