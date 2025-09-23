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
    
    let automationQuery = supabase
      .from('global_automation_settings')
      .select('*')
      .eq('enabled', true);
    
    if (userId) {
      automationQuery = automationQuery.eq('user_id', userId);
    }

    const { data: globalSettings, error: settingsError } = await automationQuery;
    
    if (settingsError) {
      throw new Error(`Failed to get automation settings: ${settingsError.message}`);
    }

    if (!globalSettings || globalSettings.length === 0) {
      console.log('⏭️ No enabled global automation settings found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No enabled automation settings found',
        processed_users: 0,
        total_articles_gathered: 0,
        total_stories_generated: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalArticlesGathered = 0;
    let totalStoriesGenerated = 0;
    let processedUsers = 0;
    const userResults: any[] = [];

    // Phase 2: Process Each User's Automation
    for (const settings of globalSettings) {
      try {
        console.log(`👤 Processing automation for user: ${settings.user_id}`);
        
        // Get user's active topics with automation enabled
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
          .eq('created_by', settings.user_id)
          .eq('is_active', true);

        if (targetTopics.length > 0) {
          topicsQuery = topicsQuery.in('id', targetTopics);
        }

        const { data: topics, error: topicsError } = await topicsQuery;
        
        if (topicsError) {
          throw new Error(`Failed to get topics for user ${settings.user_id}: ${topicsError.message}`);
        }

        if (!topics || topics.length === 0) {
          console.log(`⏭️ No active topics found for user ${settings.user_id}`);
          continue;
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
          const frequencyHours = automationSettings.scrape_frequency_hours || settings.scrape_frequency_hours;
          const nextRunAt = new Date(automationSettings.next_run_at);
          const shouldRun = now >= nextRunAt;

          console.log(`🔍 Topic "${topic.name}": Next run at ${nextRunAt.toISOString()}, should run: ${shouldRun}`);
          return shouldRun;
        });

        console.log(`📊 Found ${topicsToScrape.length} topics ready for scraping for user ${settings.user_id}`);

        if (dryRun) {
          userResults.push({
            userId: settings.user_id,
            topicsToScrape: topicsToScrape.map(t => ({
              id: t.id,
              name: t.name,
              nextRunAt: t.topic_automation_settings[0]?.next_run_at,
              frequency: t.topic_automation_settings[0]?.scrape_frequency_hours || settings.scrape_frequency_hours
            })),
            articlesGathered: 0,
            storiesGenerated: 0
          });
          continue;
        }

        let userArticlesGathered = 0;
        let userStoriesGenerated = 0;

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
            const frequencyHours = automationSettings.scrape_frequency_hours || settings.scrape_frequency_hours;
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
            if (topic.auto_simplify_enabled && settings.auto_simplify_enabled) {
              try {
                console.log(`🎨 Starting auto-simplification for topic: ${topic.name}`);

                const qualityThreshold = topic.automation_quality_threshold || settings.auto_simplify_quality_threshold;

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
                      console.log(`⏭️ Article already in queue: ${article.shared_article_content.title}`);
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
                    console.log(`✅ Queued for simplification: ${article.shared_article_content.title}`);

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
          userId: settings.user_id,
          topicsProcessed: topicsToScrape.length,
          articlesGathered: userArticlesGathered,
          storiesGenerated: userStoriesGenerated,
          success: true
        });

        totalArticlesGathered += userArticlesGathered;
        totalStoriesGenerated += userStoriesGenerated;
        processedUsers++;

        console.log(`✅ User ${settings.user_id}: ${userArticlesGathered} articles gathered, ${userStoriesGenerated} stories queued`);

      } catch (userError) {
        console.error(`❌ Error processing user ${settings.user_id}:`, userError);
        userResults.push({
          userId: settings.user_id,
          success: false,
          error: userError.message
        });
      }
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
      error: error.message,
      duration_ms: Date.now(),
      processed_users: 0,
      total_articles_gathered: 0,
      total_stories_generated: 0,
      timestamp: new Date().toISOString()
    };

    // Log the error
    try {
      await supabase
        .from('system_logs')
        .insert({
          level: 'error',
          message: `eezee News Automation Service failed: ${error.message}`,
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