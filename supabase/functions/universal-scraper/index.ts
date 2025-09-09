import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EnhancedScrapingStrategies } from '../_shared/enhanced-scraping-strategies.ts';
import { FastTrackScraper } from '../_shared/fast-track-scraper.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';
import { EnhancedRetryStrategies } from '../_shared/enhanced-retry-strategies.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startTime = Date.now();

  // Parse request body once and make variables available for error handling
  const { feedUrl, sourceId, region } = await req.json();

  try {

    if (!feedUrl || !sourceId || !region) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: feedUrl, sourceId, region' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🚀 Universal scraper started for source: ${sourceId}, region: ${region}`);
    console.log(`🌐 Target URL: ${feedUrl}`);

    // Get source information
    const { data: sourceInfo, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !sourceInfo) {
      console.error('❌ Source not found:', sourceError);
      return new Response(
        JSON.stringify({ error: 'Source not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Find the associated regional topic for this source and region
    let topicId = null;
    let topicConfig = null;
    let otherRegionalTopics = [];

    if (sourceInfo.topic_id) {
      topicId = sourceInfo.topic_id;
      
      // Get topic configuration
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topicData && !topicError) {
        topicConfig = {
          id: topicData.id,
          topic_type: topicData.topic_type,
          keywords: topicData.keywords || [],
          region: topicData.region,
          landmarks: topicData.landmarks || [],
          postcodes: topicData.postcodes || [],
          organizations: topicData.organizations || []
        };

        // Get other regional topics for dynamic negative scoring
        if (topicData.topic_type === 'regional') {
          const { data: otherTopics } = await supabase
            .from('topics')
            .select('region, keywords, landmarks')
            .eq('topic_type', 'regional')
            .neq('id', topicId)
            .eq('is_active', true);

          otherRegionalTopics = otherTopics?.map(topic => ({
            keywords: topic.keywords || [],
            landmarks: topic.landmarks || [],
            postcodes: [],
            organizations: [],
            region_name: topic.region || 'Unknown'
          })) || [];
        }

        console.log(`📍 Using topic: ${topicData.name} (${topicData.topic_type})`);
      }
    } else {
      // Fallback: find regional topic matching this region
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('topic_type', 'regional')
        .eq('region', region)
        .eq('is_active', true)
        .single();

      if (topicData && !topicError) {
        topicId = topicData.id;
        topicConfig = {
          id: topicData.id,
          topic_type: topicData.topic_type,
          keywords: topicData.keywords || [],
          region: topicData.region,
          landmarks: topicData.landmarks || [],
          postcodes: topicData.postcodes || [],
          organizations: topicData.organizations || []
        };

        // Get other regional topics for dynamic negative scoring
        const { data: otherTopics } = await supabase
          .from('topics')
          .select('region, keywords, landmarks')
          .eq('topic_type', 'regional')
          .neq('id', topicId)
          .eq('is_active', true);

        otherRegionalTopics = otherTopics?.map(topic => ({
          keywords: topic.keywords || [],
          landmarks: topic.landmarks || [],
          postcodes: [],
          organizations: [],
          region_name: topic.region || 'Unknown'
        })) || [];

        console.log(`📍 Found regional topic: ${topicData.name} for region: ${region}`);
      } else {
        console.warn(`⚠️ No regional topic found for region: ${region}`);
      }
    }


    // Initialize fast-track scraping system for better performance
    const fastTrackScraper = new FastTrackScraper(region, sourceInfo, feedUrl);
    const dbOps = new DatabaseOperations(supabase);
    const multiTenantDbOps = new MultiTenantDatabaseOperations(supabase);

    // Execute fast-track scraping with timeout protection
    console.log(`🔄 Starting fast-track scraping for ${sourceInfo.source_name}`);
    const scrapingResult = await fastTrackScraper.executeScrapingStrategy();

    let storedCount = 0;
    let duplicateCount = 0;
    let discardedCount = 0;
    let multiTenantStoredCount = 0;

    // Check for "soft failures" - successful scraping but blocked content
    const invalidContentErrors = scrapingResult.errors.filter(error => 
      error.includes('INVALID_CONTENT')
    ).length;
    
    const invalidContentPercentage = scrapingResult.articlesFound > 0 ? 
      (invalidContentErrors / scrapingResult.articlesFound) * 100 : 0;
    
    // Trigger AI fallback if >80% of articles fail with INVALID_CONTENT (blocked source)
    if (invalidContentPercentage > 80 && scrapingResult.articlesFound > 0) {
      console.log(`🚨 Source appears blocked: ${invalidContentPercentage.toFixed(1)}% INVALID_CONTENT errors`);
      console.log(`🤖 Triggering AI recovery fallback...`);
      
      try {
        const aiRecoveryResult = await supabase.functions.invoke('ai-scraper-recovery', {
          body: { 
            feedUrl, 
            sourceId, 
            failureType: 'access_denied',
            region 
          }
        });

        if (aiRecoveryResult.data && !aiRecoveryResult.error && 
            aiRecoveryResult.data.success && aiRecoveryResult.data.articlesStored > 0) {
          console.log(`✅ AI recovery successful: ${aiRecoveryResult.data.articlesStored} articles recovered`);
          
          // Update metrics and log success
          const responseTime = Date.now() - startTime;
          await dbOps.updateSourceMetrics(sourceId, true, 'ai-scraper-recovery', responseTime);
          
          await dbOps.logSystemEvent('info', 
            `AI fallback successful for blocked source: ${aiRecoveryResult.data.articlesStored} articles`,
            { sourceId, region, topicId, method: 'ai-scraper-recovery', articlesRecovered: aiRecoveryResult.data.articlesStored },
            'universal-scraper'
          );
          
          return new Response(JSON.stringify({
            success: true,
            method: 'ai-scraper-recovery',
            articlesFound: aiRecoveryResult.data.articlesStored,
            articlesScraped: aiRecoveryResult.data.articlesStored,
            articlesStored: aiRecoveryResult.data.articlesStored,
            multiTenantArticlesStored: 0, // AI recovery uses legacy storage
            duplicatesSkipped: 0,
            filteredForRelevance: 0,
            responseTime,
            errors: [],
            dualStorageEnabled: topicId ? true : false,
            fallbackUsed: true,
            blockedSourceRecovered: true,
            message: `AI recovery successful: ${aiRecoveryResult.data.articlesStored} articles recovered from blocked source`
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          console.log(`❌ AI recovery failed or returned no articles`);
        }
      } catch (aiError) {
        console.error(`❌ AI recovery error:`, aiError);
      }
    }

    if (scrapingResult.success && scrapingResult.articles.length > 0) {
      console.log(`✅ Scraping successful: ${scrapingResult.articles.length} articles found`);
      
      // Store articles in legacy system (existing functionality)
      const storageResult = await dbOps.storeArticles(
        scrapingResult.articles,
        sourceId,
        region,
        topicId,
        topicConfig,
        otherRegionalTopics
      );
      
      storedCount = storageResult.stored;
      duplicateCount = storageResult.duplicates;
      discardedCount = storageResult.discarded;

      // Store articles in multi-tenant system if topic is available
      if (topicId && topicConfig) {
        console.log(`🔄 Storing articles in multi-tenant system for topic: ${topicId}`);
        const multiTenantResult = await multiTenantDbOps.storeArticles(
          scrapingResult.articles,
          topicId,
          sourceId
        );
        
        multiTenantStoredCount = multiTenantResult.articlesProcessed;
        console.log(`📊 Multi-tenant storage: ${multiTenantStoredCount} articles processed`);
      } else {
        console.log(`⚠️ No topic available for multi-tenant storage`);
      }

      console.log(`📊 Storage complete: Legacy: ${storedCount} stored, ${duplicateCount} duplicates, ${discardedCount} discarded | Multi-tenant: ${multiTenantStoredCount} processed`);
    } else {
      console.log(`❌ Scraping failed or no articles found`);
    }

    // Update source metrics
    const responseTime = Date.now() - startTime;
    await dbOps.updateSourceMetrics(
      sourceId,
      scrapingResult.success,
      scrapingResult.method,
      responseTime
    );

    // Log system event
    await dbOps.logSystemEvent(
      scrapingResult.success ? 'info' : 'warn',
      `Universal scraper completed for ${sourceInfo.source_name}`,
      {
        sourceId,
        region,
        topicId,
        method: scrapingResult.method,
        articlesFound: scrapingResult.articlesFound,
        articlesScraped: scrapingResult.articlesScraped,
        stored: storedCount,
        duplicates: duplicateCount,
        discarded: discardedCount,
        multiTenantStored: multiTenantStoredCount,
        responseTime,
        errors: scrapingResult.errors,
        topicAssigned: topicId ? true : false,
        dualStorageEnabled: topicId ? true : false
      },
      'universal-scraper'
    );

    return new Response(
      JSON.stringify({
        success: scrapingResult.success,
        method: scrapingResult.method,
        articlesFound: scrapingResult.articlesFound,
        articlesScraped: scrapingResult.articlesScraped,
        articlesStored: storedCount,
        multiTenantArticlesStored: multiTenantStoredCount,
        duplicatesSkipped: duplicateCount,
        filteredForRelevance: discardedCount,
        responseTime,
        errors: scrapingResult.errors,
        dualStorageEnabled: topicId ? true : false,
        message: scrapingResult.success 
          ? `Successfully scraped ${storedCount} articles (${multiTenantStoredCount} multi-tenant) using ${scrapingResult.method}`
          : `Scraping failed: ${scrapingResult.errors.join(', ')}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Universal scraper error:', error);
    
    // ENHANCED: Multiple fallback system for failed scraping
    console.log('🔄 Trying enhanced fallback system...');
    try {
      // Use already parsed request data instead of parsing again
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const fallbackMethods = ['beautiful-soup-scraper', 'ai-scraper-recovery'];
      let fallbackSuccess = false;
      
      for (const method of fallbackMethods) {
        try {
          console.log(`🔄 Trying fallback method: ${method}`);
          const fallbackResult = await supabase.functions.invoke(method, {
            body: { feedUrl, sourceId, region, timeout: 30000 }
          });

          if (fallbackResult.data && !fallbackResult.error && fallbackResult.data.articlesStored > 0) {
            console.log(`✅ Fallback successful with ${method}: ${fallbackResult.data.articlesStored} articles`);
            
            // Update source to use successful method
            const dbOps = new DatabaseOperations(supabase);
            const responseTime = Date.now() - startTime;
            await dbOps.updateSourceMetrics(sourceId, true, method, responseTime);
            
            await dbOps.logSystemEvent('info', 
              `Fallback scraping successful with ${method}: ${fallbackResult.data.articlesStored} articles`,
              { sourceId, method, articles: fallbackResult.data.articlesStored },
              'universal-scraper'
            );
            
            fallbackSuccess = true;
            return new Response(JSON.stringify({
              ...fallbackResult.data,
              method: method,
              fallback_used: true,
              response_time: responseTime
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (methodError) {
          console.error(`❌ Fallback method ${method} failed:`, methodError);
          continue;
        }
      }
      
      if (!fallbackSuccess) {
        const dbOps = new DatabaseOperations(supabase);
        await dbOps.logSystemEvent('error', 
          `All scraping methods failed including fallbacks`,
          { sourceId, primaryError: error.message, fallbackMethods },
          'universal-scraper'
        );
      }
    } catch (fallbackError) {
      console.error('❌ Enhanced fallback system exception:', fallbackError);
    }
    
    // Log error event with more context
    try {
      const dbOps = new DatabaseOperations(supabase);
      await dbOps.logSystemEvent(
        'error',
        `Universal scraper failed: ${error.message}`,
        { 
          error: error.message, 
          stack: error.stack,
          sourceId: sourceId || 'unknown',
          feedUrl: feedUrl || 'unknown',
          region: region || 'unknown'
        },
        'universal-scraper'
      );
    } catch (logError) {
      console.error('❌ Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        message: 'Universal scraper encountered an error',
        fallback_attempted: true
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});