import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { EnhancedScrapingStrategies } from '../_shared/enhanced-scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';
import { calculateTopicRelevance, getRelevanceThreshold, TopicConfig } from '../_shared/hybrid-content-scoring.ts';
import { TopicRegionalConfig } from '../_shared/region-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  // Parse request body
  const { feedUrl, topicId, sourceId } = await req.json();

  if (!feedUrl || !topicId || !sourceId) {
    return new Response(JSON.stringify({ error: 'feedUrl, topicId, and sourceId are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get topic configuration
    const { data: topicData, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topicData) {
      console.error('Topic not found:', topicError);
      return new Response(JSON.stringify({ error: 'Topic not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const topicConfig: TopicConfig = {
      id: topicData.id,
      topic_type: topicData.topic_type,
      keywords: topicData.keywords || [],
      region: topicData.region,
      landmarks: topicData.landmarks || [],
      postcodes: topicData.postcodes || [],
      organizations: topicData.organizations || []
    };

    // Get other regional topics for dynamic negative scoring if this is a regional topic
    let otherRegionalTopics: TopicRegionalConfig[] = [];
    if (topicConfig.topic_type === 'regional') {
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

    // Get source information from database
    const { data: sourceInfo, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !sourceInfo) {
      console.error('Source not found:', sourceError);
      return new Response(JSON.stringify({ error: 'Source not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the provided sourceId (source already exists in database)
    const actualSourceId = sourceId;

    // Initialize scraping components with proper constructor parameters
    const scrapingStrategies = new EnhancedScrapingStrategies(
      topicConfig.region || 'general', 
      sourceInfo, 
      feedUrl
    );
    const dbOps = new DatabaseOperations(supabase);
    const multiTenantDbOps = new MultiTenantDatabaseOperations(supabase);

    const startTime = Date.now();

    // Perform scraping using unified strategy
    console.log(`Starting PARALLEL scraping for topic: ${topicConfig.topic_type} - ${topicData.name}`);
    const scrapingResult = await scrapingStrategies.executeScrapingStrategy();

    if (!scrapingResult.success) {
      console.error('Scraping failed:', scrapingResult.errors);
      
      // Update source metrics for failed scrape
      await dbOps.updateSourceMetrics(actualSourceId, false, 'rss', Date.now() - startTime);
      
      return new Response(JSON.stringify({
        success: false,
        errors: scrapingResult.errors,
        articlesFound: 0,
        articlesStored: 0
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DYNAMIC FILTERING APPROACH: Apply topic-specific filtering before storage
    const filteredArticlesWithScores = [];
    const discardedArticles = [];

    for (const article of scrapingResult.articles) {
      const relevanceScore = calculateTopicRelevance(
        article.body, 
        article.title, 
        topicConfig,
        sourceInfo.source_type || 'national',
        otherRegionalTopics
      );

      // Apply dynamic negative keyword filtering
      let shouldDiscard = false;
      let discardReason = '';
      
      const titleLower = (article.title || '').toLowerCase();
      const bodyLower = (article.body || '').toLowerCase();
      const fullText = `${titleLower} ${bodyLower}`;

      // Check negative keywords from topic configuration
      if (topicData.negative_keywords && topicData.negative_keywords.length > 0) {
        for (const negativeKeyword of topicData.negative_keywords) {
          if (fullText.includes(negativeKeyword.toLowerCase())) {
            shouldDiscard = true;
            discardReason = `Contains negative keyword: ${negativeKeyword}`;
            break;
          }
        }
      }

      // Check competing regions from topic configuration
      if (!shouldDiscard && topicData.competing_regions && topicData.competing_regions.length > 0) {
        for (const competingRegion of topicData.competing_regions) {
          if (fullText.includes(competingRegion.toLowerCase())) {
            shouldDiscard = true;
            discardReason = `Mentions competing region: ${competingRegion}`;
            break;
          }
        }
      }

      // Check relevance threshold
      const threshold = getRelevanceThreshold(topicConfig.topic_type, sourceInfo.source_type || 'national');
      if (!shouldDiscard && relevanceScore.relevance_score < threshold) {
        shouldDiscard = true;
        discardReason = `Below relevance threshold: ${relevanceScore.relevance_score}% < ${threshold}%`;
      }

      if (shouldDiscard) {
        console.log(`❌ FILTERED OUT: "${article.title.substring(0, 50)}..." - ${discardReason}`);
        discardedArticles.push({
          title: article.title,
          reason: discardReason,
          relevance_score: relevanceScore.relevance_score
        });
      } else {
        // Add comprehensive scoring metadata for articles that pass filtering
        article.regional_relevance_score = relevanceScore.relevance_score;
        article.import_metadata = {
          ...article.import_metadata,
          topic_relevance: relevanceScore,
          topic_id: topicId,
          topic_type: topicConfig.topic_type,
          filtering_method: relevanceScore.method,
          scrape_approach: 'dynamic_filtered',
          passed_negative_keywords: true,
          passed_competing_regions: true,
          passed_relevance_threshold: true
        };

        console.log(`✅ PASSED FILTER: "${article.title.substring(0, 50)}..." relevance: ${relevanceScore.relevance_score}%`);
        
        // Add detailed keyword matching debug info
        if (relevanceScore.method === 'keyword' && relevanceScore.details.keyword_matches) {
          console.log(`  Keyword matches:`, relevanceScore.details.keyword_matches);
          console.log(`  Topic keywords:`, topicConfig.keywords);
        }
        
        filteredArticlesWithScores.push(article);
      }
    }

    // Store using BOTH old and new systems for parallel testing
    // 1. Store using legacy system (existing behavior)
    const legacyResult = await dbOps.storeArticles(
      filteredArticlesWithScores,
      actualSourceId,
      topicConfig.region || 'general',
      topicId
    );

    console.log(`📊 LEGACY Storage - Stored: ${legacyResult.stored}, Duplicates: ${legacyResult.duplicates}, Discarded: ${legacyResult.discarded}`);

    // 2. Store using new multi-tenant system (parallel testing)
    let multiTenantResult = null;
    try {
      multiTenantResult = await multiTenantDbOps.storeArticles(
        filteredArticlesWithScores,
        topicId,
        actualSourceId
      );
      
      console.log(`📊 MULTI-TENANT Storage - Processed: ${multiTenantResult.articlesProcessed}, New content: ${multiTenantResult.newContentCreated}, Topic articles: ${multiTenantResult.topicArticlesCreated}, Duplicates: ${multiTenantResult.duplicatesSkipped}`);
    } catch (multiTenantError) {
      console.error('Multi-tenant storage failed (expected during migration):', multiTenantError);
      multiTenantResult = {
        success: false,
        error: multiTenantError.message,
        articlesProcessed: 0,
        newContentCreated: 0,
        topicArticlesCreated: 0,
        duplicatesSkipped: 0
      };
    }

    // Update source metrics
    await dbOps.updateSourceMetrics(actualSourceId, true, 'rss', Date.now() - startTime);

    // Log the operation with both legacy and multi-tenant results
    await dbOps.logSystemEvent('info', `PARALLEL Topic-aware scraping completed for ${topicData.name}`, {
      topic_id: topicId,
      topic_type: topicConfig.topic_type,
      source_id: actualSourceId,
      feed_url: feedUrl,
      articles_found: scrapingResult.articlesFound,
      articles_pre_filter: scrapingResult.articles.length,
      articles_filtered_out: discardedArticles.length,
      articles_passed_filter: filteredArticlesWithScores.length,
      // Legacy results
      legacy_stored: legacyResult.stored,
      legacy_duplicates: legacyResult.duplicates,
      legacy_discarded: legacyResult.discarded,
      // Multi-tenant results
      mt_success: multiTenantResult?.success || false,
      mt_processed: multiTenantResult?.articlesProcessed || 0,
      mt_new_content: multiTenantResult?.newContentCreated || 0,
      mt_topic_articles: multiTenantResult?.topicArticlesCreated || 0,
      mt_duplicates: multiTenantResult?.duplicatesSkipped || 0,
      // Configuration
      scoring_method: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
      approach: 'parallel_migration_test',
      negative_keywords_applied: topicData.negative_keywords?.length || 0,
      competing_regions_applied: topicData.competing_regions?.length || 0
    }, 'topic-aware-scraper-parallel');

    return new Response(JSON.stringify({
      success: true,
      topicName: topicData.name,
      topicType: topicConfig.topic_type,
      articlesFound: scrapingResult.articlesFound,
      articlesPreFilter: scrapingResult.articles.length,
      articlesFilteredOut: discardedArticles.length,
      articlesPassedFilter: filteredArticlesWithScores.length,
      // Legacy results
      legacyStored: legacyResult.stored,
      legacyDuplicates: legacyResult.duplicates,
      legacyDiscarded: legacyResult.discarded,
      // Multi-tenant results
      multiTenant: {
        success: multiTenantResult?.success || false,
        processed: multiTenantResult?.articlesProcessed || 0,
        newContent: multiTenantResult?.newContentCreated || 0,
        topicArticles: multiTenantResult?.topicArticlesCreated || 0,
        duplicatesSkipped: multiTenantResult?.duplicatesSkipped || 0,
        errors: multiTenantResult?.errors || []
      },
      scoringMethod: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
      approach: 'parallel_migration_test',
      negativeKeywordsApplied: topicData.negative_keywords?.length || 0,
      competingRegionsApplied: topicData.competing_regions?.length || 0,
      filteringDetails: {
        discardedArticles: discardedArticles
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in topic-aware-scraper:', error);
    
    // Beautiful Soup fallback for failed scraping
    console.log('🍲 Trying Beautiful Soup fallback for topic scraping...');
    try {
      const beautifulSoupResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/beautiful-soup-scraper`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedUrl, topicId, sourceId })
      });

      if (beautifulSoupResponse.ok) {
        const fallbackResult = await beautifulSoupResponse.json();
        console.log('✅ Beautiful Soup fallback successful for topic scraping');
        return new Response(JSON.stringify(fallbackResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (fallbackError) {
      console.error('❌ Beautiful Soup fallback also failed:', fallbackError);
    }
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});