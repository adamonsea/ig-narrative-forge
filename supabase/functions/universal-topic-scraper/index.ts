import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';
import { FastTrackScraper } from '../_shared/fast-track-scraper.ts';
import { StandardizedScraperResponse, ScraperSourceResult } from '../_shared/scraper-response-types.ts';
import { resolveDomainProfile } from '../_shared/domain-profiles.ts';

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
  maxAgeDays?: number;
  // Phase 1: Support single source filtering
  singleSourceMode?: boolean;
  enforceStrictScope?: boolean; // Opt-in strict scope enforcement
  batchSize?: number; // Number of sources to process in parallel (default: 3)
}

// Circuit breaker for failed URLs (simple in-memory cache)
const recentFailures = new Map<string, { count: number; lastFailed: number }>();
const FAILURE_THRESHOLD = 3;
const FAILURE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Normalize URL path (collapse multiple slashes, ensure single trailing slash)
function normalizeUrlPath(pathname: string): string {
  return pathname
    .replace(/\/{2,}/g, '/') // Collapse multiple slashes
    .replace(/\/$/, '') + '/'; // Ensure single trailing slash
}

// Quick URL pre-validation
async function quickUrlCheck(url: string, timeoutMs: number = 3000): Promise<boolean> {
  const isLikelyAccessible = (status: number) => status >= 200 && status < 400;
  const shouldFallbackToGet = (status: number) => [401, 403, 405, 406, 429].includes(status);

  const performRequest = async (
    method: 'HEAD' | 'GET',
    timeout: number,
    extraHeaders: Record<string, string> = {}
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'eeZee Universal Scraper/1.0',
          ...extraHeaders
        }
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const headResponse = await performRequest('HEAD', timeoutMs);

    if (headResponse.ok || isLikelyAccessible(headResponse.status)) {
      return true;
    }

    if (shouldFallbackToGet(headResponse.status)) {
      console.log(`🔄 HEAD blocked (${headResponse.status}) for ${url}, trying GET fallback...`);
      const getResponse = await performRequest('GET', timeoutMs + 1000, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Range': 'bytes=0-1023'
      });

      if (getResponse.ok || isLikelyAccessible(getResponse.status)) {
        try {
          await getResponse.arrayBuffer();
        } catch (_) {
          // Ignore partial consumption errors
        }
        console.log(`✅ GET fallback succeeded for ${url}`);
        return true;
      }

      console.log(`⚡ GET fallback failed for ${url}: status ${getResponse.status}`);
      return false;
    }

    console.log(`⚡ HEAD request blocked for ${url}: status ${headResponse.status}`);
    return false;
  } catch (error) {
    console.log(`⚡ Quick check failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
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
      maxSources = testMode ? 1 : undefined,  // Ultra-aggressive: only 1 source in test mode
      singleSourceMode = false,
      maxAgeDays,  // Can be overridden, otherwise uses topic setting
      enforceStrictScope = false, // Default: allow RSS/HTML fallbacks
      batchSize = 3 // Process 3 sources at a time by default
    } = await req.json() as UniversalScrapeRequest;

    console.log('Universal Topic Scraper - Starting for topic:', topicId);

    // Initialize standardized response handler
    const standardResponse = new StandardizedScraperResponse();

    // Get topic details including max_article_age_days
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }
    
    // Use topic-specific max age if not provided in request
    const effectiveMaxAgeDays = maxAgeDays ?? topic.max_article_age_days ?? 7;
    console.log(`Using max article age: ${effectiveMaxAgeDays} days for topic "${topic.name}"`);

    // Get topic sources using junction table
    const { data: topicSources, error: sourcesError } = await supabase
      .rpc('get_topic_sources', { p_topic_id: topicId });

    if (sourcesError) {
      throw new Error(`Failed to get topic sources: ${sourcesError.message}`);
    }

    console.log(`📋 Fetched ${topicSources?.length || 0} total sources from database for topic: ${topic.name}`);
    if (topicSources && topicSources.length > 0) {
      console.log(`📋 Source list: ${topicSources.map((s: any) => `${s.source_name} (${s.source_id})`).join(', ')}`);
    }

    // Filter sources if specific sourceIds provided
    let targetSources = sourceIds 
      ? topicSources.filter((source: any) => sourceIds.includes(source.source_id))
      : topicSources;
    
    if (sourceIds && sourceIds.length > 0) {
      console.log(`🎯 Filtered to ${targetSources.length} specific source(s): ${sourceIds.join(', ')}`);
      if (targetSources.length > 0) {
        console.log(`🎯 Target sources: ${targetSources.map((s: any) => s.source_name).join(', ')}`);
      }
    }
    
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

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 DIAGNOSTIC: Starting pre-validation for ${targetSources.length} sources`);
    console.log(`${'='.repeat(80)}\n`);

    const scraper = new FastTrackScraper(supabase);
    const dbOps = new MultiTenantDatabaseOperations(supabase as any);
    const results: ScraperSourceResult[] = [];
    let processedCount = 0;
    const startTime = Date.now();
    const maxExecutionTime = testMode ? 45000 : 180000; // 45s test mode, 3min normal

    // Pre-filter sources using circuit breaker and quick validation
    const validSources = [];
    const filterReasons: Record<string, string> = {};
    
    for (const source of targetSources) {
      console.log(`\n🔍 PRE-VALIDATION: ${source.source_name} (ID: ${source.source_id})`);
      console.log(`   URL: ${source.feed_url}`);
      console.log(`   Status: ${source.is_active ? '✅ Active' : '❌ Inactive'}`);
      let feedUrl = source.feed_url;
      
      // Skip if invalid URL
      if (!feedUrl || typeof feedUrl !== 'string' || feedUrl.trim() === '') {
        const reason = 'Invalid or missing feed URL';
        console.log(`   ❌ FILTERED OUT: ${reason}`);
        filterReasons[source.source_id] = reason;
        standardResponse.addSourceResult({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: reason,
          articlesFound: 0,
          articlesScraped: 0
        });
        standardResponse.addWarning(`${source.source_name}: ${reason}`);
        continue;
      }

      // Normalize URL and path
      feedUrl = feedUrl.trim();
      if (!feedUrl.match(/^https?:\/\//)) {
        feedUrl = `https://${feedUrl}`;
      }
      
      const urlObj = new URL(feedUrl);
      urlObj.pathname = normalizeUrlPath(urlObj.pathname);
      feedUrl = urlObj.toString();

      // Circuit breaker check
      if (shouldSkipUrl(feedUrl)) {
        const reason = 'Circuit breaker: Recent failures detected';
        console.log(`   🚫 FILTERED OUT: ${reason}`);
        filterReasons[source.source_id] = reason;
        standardResponse.addSourceResult({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: 'Skipped due to recent failures',
          articlesFound: 0,
          articlesScraped: 0
        });
        standardResponse.addWarning(`${source.source_name}: ${reason}`);
        continue;
      }

      // Quick pre-validation in test mode
      if (testMode) {
        console.log(`   ⚡ Running quick accessibility check (test mode)...`);
        const isAccessible = await quickUrlCheck(feedUrl, 2000); // 2s timeout
        if (!isAccessible) {
          const reason = 'Failed quick accessibility check';
          console.log(`   ❌ FILTERED OUT: ${reason}`);
          filterReasons[source.source_id] = reason;
          recordFailure(feedUrl);
          standardResponse.addSourceResult({
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: reason,
            articlesFound: 0,
            articlesScraped: 0
          });
          continue;
        }
        console.log(`   ✅ Quick check passed`);
      }

      // Pre-scrape validation: Check Newsquest sources for missing scraping_config
      const newsquestDomains = ['theargus.co.uk', 'sussexexpress.co.uk', 'crawleyobserver.co.uk', 'brightonandhoveindependent.co.uk'];
      const isNewsquest = newsquestDomains.some(d => feedUrl.includes(d));
      
      if (isNewsquest) {
        console.log(`   📰 Newsquest domain detected`);
        const sourceConfig = source.scraping_config;
        console.log(`   🔧 Current scraping_config:`, JSON.stringify(sourceConfig, null, 2));
        
        if (!sourceConfig?.sectionPath) {
          console.log(`   ⚠️ Missing sectionPath, extracting from URL...`);
          
          try {
        // Reuse the already-normalized urlObj from line 255-257
        const normalizedPath = urlObj.pathname; // Already normalized
            const arcSite = extractDomainFromUrl(feedUrl).split('.')[0]; // e.g. "theargus"
            
            // CRITICAL: Fetch existing config to preserve trust flags
            const { data: currentSource } = await supabase
              .from('content_sources')
              .select('scraping_config')
              .eq('id', source.source_id)
              .single();
            
            // Merge Arc config with existing config to preserve trust_content_relevance and trusted_max_age_days
            const mergedConfig = {
              ...(currentSource?.scraping_config || {}),  // Preserve existing fields
              sectionPath: normalizedPath,
              arcSite,
              arcCompatible: true,
              autoExtracted: true,
              extractedAt: new Date().toISOString()
            };
            
            // Update source with merged config AND confirmed_arc_section
            const { error: updateError } = await supabase
              .from('content_sources')
              .update({ 
                scraping_config: mergedConfig,
                confirmed_arc_section: normalizedPath
              })
              .eq('id', source.source_id);
            
            if (!updateError) {
              console.log(`   ✅ Auto-configured Arc API: sectionPath="${normalizedPath}", arcSite="${arcSite}"`);
              source.scraping_config = mergedConfig;
            }
          } catch (extractError) {
            console.error(`   ❌ Failed to auto-extract config:`, extractError);
          }
        } else {
          console.log(`   ✅ Newsquest config present: sectionPath="${sourceConfig.sectionPath}", arcSite="${sourceConfig.arcSite || 'not set'}"`);
        }
      }
      
      // Only enable strict scope if explicitly requested
      const shouldEnforceStrict = !!source.scraping_config?.strictScope || enforceStrictScope;
      const strictScope = shouldEnforceStrict ? {
        host: urlObj.hostname,
        pathPrefix: urlObj.pathname
      } : undefined;
      
      console.log(`   ✅ PASSED PRE-VALIDATION - Will attempt to scrape`);
      if (shouldEnforceStrict && strictScope) {
        console.log(`   🔒 Strict scope enabled: host="${strictScope.host}", pathPrefix="${strictScope.pathPrefix}"`);
      } else {
        console.log(`   🌐 RSS/HTML fallbacks enabled (strict scope OFF)`);
      }
      validSources.push({ ...source, normalizedUrl: feedUrl, strictScope });
    }
    
    // Helper function to extract domain
    function extractDomainFromUrl(url: string): string {
      try {
        return new URL(url).hostname.replace('www.', '');
      } catch {
        return 'unknown-domain';
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 PRE-VALIDATION SUMMARY:`);
    console.log(`   Total sources: ${targetSources.length}`);
    console.log(`   Passed: ${validSources.length}`);
    console.log(`   Filtered out: ${targetSources.length - validSources.length}`);
    if (Object.keys(filterReasons).length > 0) {
      console.log(`\n   Filter reasons:`);
      for (const [sourceId, reason] of Object.entries(filterReasons)) {
        const sourceName = targetSources.find((s: any) => s.source_id === sourceId)?.source_name || sourceId;
        console.log(`   - ${sourceName}: ${reason}`);
      }
    }
    if (validSources.length > 0) {
      console.log(`\n   ✅ Sources to scrape:`);
      validSources.forEach((s: any) => {
        console.log(`   - ${s.source_name} (${s.source_id}): ${s.normalizedUrl}`);
      });
    }
    console.log(`${'='.repeat(80)}\n`);

    if (validSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No valid sources to scrape after pre-validation',
          topicId,
          results: [],
          diagnostics: {
            totalSources: targetSources.length,
            filterReasons
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process sources in batches to avoid CPU timeout
    const totalBatches = Math.ceil(validSources.length / batchSize);
    console.log(`\n📦 Processing ${validSources.length} sources in ${totalBatches} batch(es) of ${batchSize}`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Early exit condition - check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxExecutionTime * 0.8) { // Exit at 80% of max time
        console.log(`⏰ Approaching timeout (${elapsedTime}ms), stopping with partial results`);
        const remainingSources = validSources.slice(batchIndex * batchSize);
        for (const source of remainingSources) {
          const timeoutResult: ScraperSourceResult = {
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: 'Skipped due to approaching timeout',
            articlesFound: 0,
            articlesScraped: 0
          };
          standardResponse.addSourceResult(timeoutResult);
        }
        break;
      }

      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, validSources.length);
      const batch = validSources.slice(batchStart, batchEnd);
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 BATCH ${batchIndex + 1}/${totalBatches}: Processing ${batch.length} source(s)`);
      console.log(`   Sources: ${batch.map((s: any) => s.source_name).join(', ')}`);
      console.log(`${'='.repeat(80)}\n`);

      // Process all sources in this batch in parallel
      const batchPromises = batch.map(async (source: any) => {
        processedCount++;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 SCRAPING [${processedCount}/${validSources.length}]: ${source.source_name}`);
        console.log(`   Source ID: ${source.source_id}`);
        console.log(`   URL: ${source.normalizedUrl}`);
        console.log(`   Config:`, JSON.stringify(source.scraping_config, null, 2));
        
        // Check source scrape frequency cooldown (respect individual source settings)
        const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at).getTime() : 0;
        const scrapeFrequency = source.scrape_frequency_hours || 24; // Default 24h if not set
        const hoursSince = (Date.now() - lastScraped) / (1000 * 60 * 60);
        
        if (hoursSince < scrapeFrequency && lastScraped > 0 && !forceRescrape) {
          const hoursUntilNext = Math.max(0, scrapeFrequency - hoursSince);
          console.log(`⏸️ COOLDOWN: Source "${source.source_name}" scraped ${Math.round(hoursSince)}h ago - skipping (${scrapeFrequency}h frequency)`);
          console.log(`   Next scrape available in: ${hoursUntilNext.toFixed(1)}h`);
          console.log(`${'='.repeat(80)}\n`);
          
          return {
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: true, // Changed to true - cooldown is not a failure
            status: 'skipped_cooldown',
            message: `Source scraped ${Math.round(hoursSince)}h ago (${scrapeFrequency}h frequency). Next scrape available in ${hoursUntilNext.toFixed(1)}h.`,
            lastScrapedAgo: `${Math.round(hoursSince)}h ago`,
            nextScrapeIn: `${hoursUntilNext.toFixed(1)}h`,
            articlesFound: 0,
            articlesScraped: 0
          };
        }
        
        if (forceRescrape) {
          console.log(`🔓 FORCE RESCRAPE: Bypassing cooldown for "${source.source_name}"`);
        }
        
        console.log(`✅ Cooldown check passed: last scraped ${Math.round(hoursSince)}h ago (${scrapeFrequency}h frequency)`);
        
        console.log(`${'='.repeat(80)}\n`);
        
        // Ultra-aggressive timeouts for test mode
        const sourceTimeout = testMode ? 8000 : 30000; // 8s test, 30s normal
        const sourcePromise = (async () => {
          try {

            // Log diagnosis before scraping
            const diagnosisCheck = await scraper.quickDiagnosis(source.normalizedUrl);
            if (diagnosisCheck) {
              await supabase.from('system_logs').insert({
                level: diagnosisCheck.diagnosis === 'ok' ? 'info' : 'warning',
                category: 'scraping_diagnosis',
                message: `Source diagnosis: ${diagnosisCheck.diagnosis}`,
                metadata: {
                  source_id: source.source_id,
                  source_name: source.source_name,
                  url: source.normalizedUrl,
                  diagnosis: diagnosisCheck.diagnosis,
                  blocking_server: diagnosisCheck.blockingServer,
                  response_time: diagnosisCheck.responseTime,
                  error: diagnosisCheck.error
                }
              });
            }

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
                strictScope: source.strictScope, // Pass strict scope for index-only scraping
              }
            );

            // 🔍 DEBUG: Detailed scraping diagnostics
            console.log(`\n🔍 SCRAPE DIAGNOSTICS for "${source.source_name}":`);
            console.log(`   URL: ${source.normalizedUrl}`);
            console.log(`   Success: ${scrapeResult.success}`);
            console.log(`   Articles Found: ${scrapeResult.articlesFound}`);
            console.log(`   Articles Scraped: ${scrapeResult.articlesScraped}`);
            console.log(`   Errors: ${scrapeResult.errors.length > 0 ? JSON.stringify(scrapeResult.errors) : 'None'}`);
            console.log(`   Scraping Method: ${scrapeResult.method || 'Unknown'}`);
            console.log(`   Response Status: ${scrapeResult.statusCode || 'N/A'}`);
            console.log(`   Content Type: ${scrapeResult.contentType || 'N/A'}`);
            console.log(`   Content Size: ${scrapeResult.contentSize || 'N/A'} bytes`);
            console.log(`   Processing Time: ${Date.now() - startTime}ms\n`);

            if (scrapeResult.success && scrapeResult.articles.length > 0) {
              // Get source scraping config for trusted source bypass
              const { data: sourceData } = await supabase
                .from('content_sources')
                .select('scraping_config')
                .eq('id', source.source_id)
                .single();
              
              // Store articles using multi-tenant approach with topic-specific age filter
              const storeResult = await dbOps.storeArticles(
                scrapeResult.articles,
                topicId,
                source.source_id,
                effectiveMaxAgeDays,  // Use topic-specific max age
                sourceData?.scraping_config || {}  // Pass scraping config for trusted source bypass
              );

              const result: ScraperSourceResult = {
                sourceId: source.source_id,
                sourceName: source.source_name,
                success: true,
                articlesFound: scrapeResult.articlesFound,
                articlesScraped: scrapeResult.articlesScraped,
                articlesStored: storeResult.articlesStored,
                rejectedLowRelevance: storeResult.rejectedLowRelevance,
                rejectedLowQuality: storeResult.rejectedLowQuality,
                rejectedCompeting: storeResult.rejectedCompeting,
                executionTimeMs: Date.now() - startTime
              };

              console.log(`\n   ✅ SUCCESS: ${source.source_name}`);
              console.log(`      Articles scraped: ${scrapeResult.articlesScraped}`);
              console.log(`      Articles stored: ${storeResult.articlesStored}`);
              console.log(`      Rejected (low relevance): ${storeResult.rejectedLowRelevance}`);
              console.log(`      Rejected (low quality): ${storeResult.rejectedLowQuality}`);
              console.log(`      Rejected (competing): ${storeResult.rejectedCompeting}\n`);

              return result;
            } else {
              // Check if this is a successful scrape with no new articles vs a failed scrape
              const hasAccessibilityErrors = scrapeResult.errors.some(e => 
                e.includes('Failed to fetch') || 
                e.includes('Network error') || 
                e.includes('timeout') ||
                e.includes('HTTP error')
              );
              
              // If the feed was accessible but just empty, mark as success with 0 articles
              if (!hasAccessibilityErrors && scrapeResult.articlesFound === 0) {
                console.log(`✅ ${source.source_name}: Feed accessible but no new articles found`);
                return {
                  sourceId: source.source_id,
                  sourceName: source.source_name,
                  success: true,
                  articlesFound: 0,
                  articlesScraped: 0,
                  executionTimeMs: Date.now() - startTime
                } as ScraperSourceResult;
              }

              // Smarter Beautiful Soup fallback for whitelisted domains
              const WHITELISTED_DOMAINS = ['theargus.co.uk', 'sussexexpress.co.uk'];
              const isWhitelisted = WHITELISTED_DOMAINS.some(domain => 
                source.normalizedUrl.includes(domain)
              );
              
              // Trigger fallback if:
              // 1. Zero articles scraped AND has accessibility/content errors, OR
              // 2. Found many articles (≥10) but scraped very few (<3), OR
              // 3. High rate of INVALID_CONTENT errors
              const invalidContentErrors = scrapeResult.errors.filter(e => 
                e.includes('INVALID_CONTENT') || e.includes('insufficient content')
              ).length;
              const shouldUseFallback = isWhitelisted && (
                (scrapeResult.articlesScraped === 0 && hasAccessibilityErrors) ||
                (scrapeResult.articlesFound >= 10 && scrapeResult.articlesScraped < 3) ||
                (invalidContentErrors >= 5)
              );
              
              if (shouldUseFallback) {
                // Skip Beautiful Soup fallback when strict scope is active (index-only mode)
                if (source.strictScope) {
                  console.log(`🔒 FastTrack insufficient (found: ${scrapeResult.articlesFound}, scraped: ${scrapeResult.articlesScraped}, invalid: ${invalidContentErrors})`);
                  console.log(`🔒 Skipping Beautiful Soup fallback - strict scope enabled (index-only mode)`);
                  return result; // Return early, outer handler will add to standardResponse
                }
                
                console.log(`🔄 FastTrack insufficient for ${source.source_name} (found: ${scrapeResult.articlesFound}, scraped: ${scrapeResult.articlesScraped}, invalid: ${invalidContentErrors}), trying Beautiful Soup fallback...`);
                
                try {
                  const fallbackResult = await supabase.functions.invoke('beautiful-soup-scraper', {
                    body: {
                      feedUrl: source.normalizedUrl,
                      sourceId: source.source_id,
                      topicId: topicId,
                      region: topic.region,
                      maxArticles: 15 // Capped at 15 for fallback
                    }
                  });

                  if (fallbackResult.data?.success && fallbackResult.data?.articles?.length > 0) {
                    console.log(`✅ Beautiful Soup fallback successful: ${fallbackResult.data.articles.length} articles found`);
                    
                    // Store fallback articles with topic-specific age filter and source config
                    const fallbackStoreResult = await dbOps.storeArticles(
                      fallbackResult.data.articles,
                      topicId,
                      source.source_id,
                      effectiveMaxAgeDays,  // Use topic-specific max age
                      sourceData?.scraping_config || {}  // ✅ CRITICAL: Pass source config for trusted source bypass
                    );

                    return {
                      sourceId: source.source_id,
                      sourceName: source.source_name,
                      success: true,
                      articlesFound: fallbackResult.data.articles.length,
                      articlesScraped: fallbackResult.data.articles.length,
                      articlesStored: fallbackStoreResult.articlesStored,
                      rejectedLowRelevance: fallbackStoreResult.rejectedLowRelevance,
                      rejectedLowQuality: fallbackStoreResult.rejectedLowQuality,
                      rejectedCompeting: fallbackStoreResult.rejectedCompeting,
                      executionTimeMs: Date.now() - startTime,
                      fallbackMethod: 'beautiful-soup-scraper'
                    } as ScraperSourceResult;
                  } else if (fallbackResult.data?.success && fallbackResult.data?.articles?.length === 0) {
                    // Beautiful Soup also found no articles but was successful - this means the source is genuinely empty
                    console.log(`✅ Beautiful Soup confirms ${source.source_name} has no new articles`);
                    return {
                      sourceId: source.source_id,
                      sourceName: source.source_name,
                      success: true,
                      articlesFound: 0,
                      articlesScraped: 0,
                      executionTimeMs: Date.now() - startTime,
                      fallbackMethod: 'beautiful-soup-scraper'
                    } as ScraperSourceResult;
                  } else {
                    console.log(`❌ Beautiful Soup fallback also failed for ${source.source_name}`);
                  }
                } catch (fallbackError) {
                  console.log(`❌ Beautiful Soup fallback error for ${source.source_name}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                }
              }

              // Only mark as failed if there were actual technical errors
              recordFailure(source.normalizedUrl);
              const result: ScraperSourceResult = {
                sourceId: source.source_id,
                sourceName: source.source_name,
                success: false,
                error: scrapeResult.errors.join(', ') || 'Technical error occurred',
                articlesFound: 0,
                articlesScraped: 0
              };

              console.log(`\n   ❌ FAILED: ${source.source_name}`);
              console.log(`      Errors: ${scrapeResult.errors.join(', ')}`);
              console.log(`      Articles found: ${scrapeResult.articlesFound}`);
              console.log(`      Articles scraped: ${scrapeResult.articlesScraped}`);
              console.log(`      Method attempted: ${scrapeResult.method || 'unknown'}\n`);
              return result;
            }
          } catch (sourceError) {
            console.error(`\n   💥 EXCEPTION: ${source.source_name}`);
            console.error(`      Error type: ${sourceError instanceof Error ? sourceError.constructor.name : typeof sourceError}`);
            console.error(`      Error message: ${sourceError instanceof Error ? sourceError.message : String(sourceError)}`);
            if (sourceError instanceof Error && sourceError.stack) {
              console.error(`      Stack trace: ${sourceError.stack}`);
            }
            console.error('');
            recordFailure(source.normalizedUrl);
            
            return {
              sourceId: source.source_id,
              sourceName: source.source_name,
              success: false,
              error: sourceError instanceof Error ? sourceError.message : String(sourceError),
              articlesFound: 0,
              articlesScraped: 0
            } as ScraperSourceResult;
          }
        })();

        // Apply timeout to the entire source processing
        try {
          const timeoutPromise = new Promise<ScraperSourceResult>((_, reject) => 
            setTimeout(() => reject(new Error(`Source timeout after ${sourceTimeout}ms`)), sourceTimeout)
          );
          
          const result = await Promise.race([sourcePromise, timeoutPromise]);

          // Update last_scraped_at for successful scrapes (including empty results)
          if (result.success) {
            try {
              const { error: updateError } = await supabase
                .from('content_sources')
                .update({
                  articles_scraped: source.articles_scraped + (result.articlesScraped || 0),
                  last_scraped_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', source.source_id);

              if (updateError) {
                console.error(`❌ Error updating source metrics for ${source.source_name}:`, updateError);
              } else {
                console.log(`✅ Updated last_scraped_at for ${source.source_name}`);
              }
            } catch (updateErr) {
              console.error(`❌ Error updating source metrics for ${source.source_name}:`, updateErr);
            }
          }
          
          return result;
        } catch (timeoutError) {
          console.error(`⏰ Timeout processing ${source.source_name}:`, timeoutError);
          recordFailure(source.normalizedUrl);
          const timeoutResult: ScraperSourceResult = {
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: `Processing timeout: ${timeoutError instanceof Error ? timeoutError.message : String(timeoutError)}`,
            articlesFound: 0,
            articlesScraped: 0
          };
          return timeoutResult;
        }
      });

      // Wait for all sources in this batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Add all results to the standard response
      batchResults.forEach((promiseResult, index) => {
        if (promiseResult.status === 'fulfilled') {
          standardResponse.addSourceResult(promiseResult.value);
        } else {
          const source = batch[index];
          console.error(`❌ Batch promise rejected for ${source.source_name}:`, promiseResult.reason);
          standardResponse.addSourceResult({
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: `Promise rejected: ${promiseResult.reason instanceof Error ? promiseResult.reason.message : String(promiseResult.reason)}`,
            articlesFound: 0,
            articlesScraped: 0
          });
        }
      });

      console.log(`\n✅ Batch ${batchIndex + 1}/${totalBatches} complete`);
      console.log(`   Processed: ${batchResults.filter(r => r.status === 'fulfilled').length}/${batch.length} sources`);
      console.log(`   Total progress: ${processedCount}/${validSources.length} sources\n`);
    }

    console.log(`🏁 Completed processing ${processedCount}/${validSources.length} sources for topic: ${topic.name} in ${Date.now() - startTime}ms`);

    // Finalize standardized response
    standardResponse.setExecutionTime(startTime);
    const finalResponse = standardResponse.finalize();

    // Background system event logging (don't wait for it)
    void supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: testMode ? 'Ultra-fast universal topic scraping completed' : 'Universal topic scraping completed',
        context: {
          topicId,
          topicName: topic.name,
          sourcesProcessed: processedCount,
          totalArticles: finalResponse.summary.totalArticlesStored,
          successfulSources: finalResponse.summary.successfulSources,
          executionTimeMs: finalResponse.summary.executionTimeMs,
          status: finalResponse.status,
          testMode
        },
        function_name: 'universal-topic-scraper'
      });

    return new Response(
      JSON.stringify(finalResponse),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Universal Topic Scraper Error:', error);
    
    const errorResponse = new StandardizedScraperResponse();
    errorResponse.addError(`Critical scraper error: ${error instanceof Error ? error.message : String(error)}`);
    errorResponse.setExecutionTime(Date.now() - 1000); // Fallback timing
    
    return new Response(
      errorResponse.toJSON(),
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