import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';
import { FastTrackScraper } from '../_shared/fast-track-scraper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UniversalScrapeRequest {
  topicId: string;
  sourceIds?: string[];
  forceRescrape?: boolean;
  testMode?: boolean;
  maxSources?: number;
}

// Circuit breaker for failed URLs (simple in-memory cache)
const recentFailures = new Map<string, { count: number; lastFailed: number }>();
const FAILURE_THRESHOLD = 3;
const FAILURE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Quick URL pre-validation
async function quickUrlCheck(url: string, timeoutMs: number = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'eeZee Universal Scraper/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log(`⚡ Quick check failed for ${url}: ${error.message}`);
    return false;
  }
}

// Check if URL should be skipped due to recent failures
function shouldSkipUrl(url: string): boolean {
  const failure = recentFailures.get(url);
  if (!failure) return false;
  
  const now = Date.now();
  if (now - failure.lastFailed > FAILURE_COOLDOWN) {
    recentFailures.delete(url);
    return false;
  }
  
  return failure.count >= FAILURE_THRESHOLD;
}

// Record URL failure
function recordFailure(url: string): void {
  const failure = recentFailures.get(url) || { count: 0, lastFailed: 0 };
  failure.count++;
  failure.lastFailed = Date.now();
  recentFailures.set(url, failure);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { 
      topicId, 
      sourceIds, 
      forceRescrape = false, 
      testMode = false, 
      maxSources = testMode ? 1 : undefined  // Ultra-aggressive: only 1 source in test mode
    } = await req.json() as UniversalScrapeRequest;

    console.log('Universal Topic Scraper - Starting for topic:', topicId);

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Get topic sources using junction table
    const { data: topicSources, error: sourcesError } = await supabase
      .rpc('get_topic_sources', { p_topic_id: topicId });

    if (sourcesError) {
      throw new Error(`Failed to get topic sources: ${sourcesError.message}`);
    }

    // Filter sources if specific sourceIds provided
    let targetSources = sourceIds 
      ? topicSources.filter(source => sourceIds.includes(source.source_id))
      : topicSources;
    
    // Apply maxSources limit for test mode or explicit limit
    if (maxSources && targetSources.length > maxSources) {
      targetSources = targetSources.slice(0, maxSources);
      console.log(`🔬 Test mode: Limited to ${maxSources} source(s) for ultra-fast testing`);
    }

    if (!targetSources || targetSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No sources to scrape',
          topicId,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${targetSources.length} sources for topic: ${topic.name}${testMode ? ' (ULTRA-FAST TEST MODE)' : ''}`);

    const scraper = new FastTrackScraper(supabase);
    const dbOps = new MultiTenantDatabaseOperations(supabase);
    const results = [];
    let processedCount = 0;
    const startTime = Date.now();
    const maxExecutionTime = testMode ? 45000 : 180000; // 45s test mode, 3min normal

    // Pre-filter sources using circuit breaker and quick validation
    const validSources = [];
    for (const source of targetSources) {
      let feedUrl = source.feed_url;
      
      // Skip if invalid URL
      if (!feedUrl || typeof feedUrl !== 'string' || feedUrl.trim() === '') {
        console.log(`⚠️ Skipping ${source.source_name}: Invalid URL`);
        results.push({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: 'Invalid or missing feed URL',
          articlesFound: 0,
          articlesScraped: 0
        });
        continue;
      }

      // Normalize URL
      feedUrl = feedUrl.trim();
      if (!feedUrl.match(/^https?:\/\//)) {
        feedUrl = `https://${feedUrl}`;
      }

      // Circuit breaker check
      if (shouldSkipUrl(feedUrl)) {
        console.log(`🚫 Skipping ${source.source_name}: Recent failures (circuit breaker)`);
        results.push({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: 'Skipped due to recent failures',
          articlesFound: 0,
          articlesScraped: 0
        });
        continue;
      }

      // Quick pre-validation in test mode
      if (testMode) {
        console.log(`⚡ Quick validation check for ${source.source_name}...`);
        const isAccessible = await quickUrlCheck(feedUrl, 2000); // 2s timeout
        if (!isAccessible) {
          console.log(`❌ Quick check failed for ${source.source_name}`);
          recordFailure(feedUrl);
          results.push({
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: 'Failed quick accessibility check',
            articlesFound: 0,
            articlesScraped: 0
          });
          continue;
        }
        console.log(`✅ Quick check passed for ${source.source_name}`);
      }

      validSources.push({ ...source, normalizedUrl: feedUrl });
    }

    if (validSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No valid sources to scrape after pre-validation',
          topicId,
          results
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Pre-validation complete: ${validSources.length}/${targetSources.length} sources passed`);

    // Process each valid source with aggressive timeouts
    for (const source of validSources) {
      // Early exit condition - check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxExecutionTime * 0.8) { // Exit at 80% of max time
        console.log(`⏰ Approaching timeout (${elapsedTime}ms), stopping with partial results`);
        results.push({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: 'Stopped due to approaching function timeout',
          articlesFound: 0,
          articlesScraped: 0
        });
        break;
      }

      processedCount++;
      console.log(`📊 Progress: ${processedCount}/${validSources.length} - Processing: ${source.source_name}`);
      
      // Ultra-aggressive timeouts for test mode
      const sourceTimeout = testMode ? 8000 : 30000; // 8s test, 30s normal
      const sourcePromise = (async () => {
        try {
          console.log(`🔄 Scraping source: ${source.source_name} (${source.normalizedUrl})`);

          // Execute scraping with ultra-aggressive settings for test mode
          const scrapeResult = await scraper.scrapeContent(
            source.normalizedUrl,
            source.source_id,
            {
              forceRescrape,
              userAgent: 'eeZee Universal Topic Scraper/1.0',
              timeout: testMode ? 5000 : 20000, // 5s test, 20s normal
              maxRetries: testMode ? 1 : 3, // Only 1 retry in test mode
              retryDelay: testMode ? 500 : 2000, // 0.5s retry delay in test mode
            }
          );

          if (scrapeResult.success && scrapeResult.articles.length > 0) {
            // Store articles using multi-tenant approach
            const storeResult = await dbOps.storeArticles(
              scrapeResult.articles,
              topicId,
              source.source_id
            );

            // Background update of source metrics (don't wait for it)
            supabase
              .from('content_sources')
              .update({
                articles_scraped: source.articles_scraped + scrapeResult.articlesScraped,
                last_scraped_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', source.source_id)
              .then(() => console.log(`📈 Updated metrics for ${source.source_name}`))
              .catch(err => console.log(`⚠️ Failed to update metrics: ${err.message}`));

            const result = {
              sourceId: source.source_id,
              sourceName: source.source_name,
              success: true,
              articlesFound: scrapeResult.articlesFound,
              articlesScraped: scrapeResult.articlesScraped,
              multiTenantStored: storeResult.topicArticlesCreated,
              method: scrapeResult.method,
              processingTime: Date.now() - startTime
            };

            console.log(`✅ ${source.source_name}: ${scrapeResult.articlesScraped} articles scraped, ${storeResult.topicArticlesCreated} stored`);
            return result;
          } else {
            recordFailure(source.normalizedUrl);
            const result = {
              sourceId: source.source_id,
              sourceName: source.source_name,
              success: false,
              error: scrapeResult.errors.join(', ') || 'No articles found',
              articlesFound: 0,
              articlesScraped: 0
            };

            console.log(`❌ ${source.source_name}: ${scrapeResult.errors.join(', ')}`);
            return result;
          }
        } catch (sourceError) {
          console.error(`💥 Error scraping ${source.source_name}:`, sourceError);
          recordFailure(source.normalizedUrl);
          
          return {
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: sourceError.message,
            articlesFound: 0,
            articlesScraped: 0
          };
        }
      })();

      // Apply timeout to the entire source processing
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Source timeout after ${sourceTimeout}ms`)), sourceTimeout)
        );
        
        const result = await Promise.race([sourcePromise, timeoutPromise]);
        results.push(result);
      } catch (timeoutError) {
        console.error(`⏰ Timeout processing ${source.source_name}:`, timeoutError);
        recordFailure(source.normalizedUrl);
        results.push({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: `Processing timeout: ${timeoutError.message}`,
          articlesFound: 0,
          articlesScraped: 0
        });
      }
    }

    console.log(`🏁 Completed processing ${processedCount}/${validSources.length} sources for topic: ${topic.name} in ${Date.now() - startTime}ms`);

    // Background system event logging (don't wait for it)
    supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: testMode ? 'Ultra-fast universal topic scraping completed' : 'Universal topic scraping completed',
        context: {
          topicId,
          topicName: topic.name,
          sourcesProcessed: processedCount,
          totalArticles: results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0),
          successfulSources: results.filter(r => r.success).length,
          executionTimeMs: Date.now() - startTime,
          testMode
        },
        function_name: 'universal-topic-scraper'
      })
      .then(() => console.log('📝 System log recorded'))
      .catch(err => console.log(`⚠️ Failed to log: ${err.message}`));

    const totalArticles = results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0);
    const successfulSources = results.filter(r => r.success).length;
    const executionTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        topicId,
        topicName: topic.name,
        sourcesProcessed: processedCount,
        sourcesTotal: targetSources.length,
        successfulSources,
        totalArticles,
        executionTimeMs: executionTime,
        testMode,
        results,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Universal Topic Scraper Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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