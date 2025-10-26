import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

  // Declare variables at function scope with default values to avoid "used before assignment" errors
  let feedUrl = '';
  let topicId = ''; 
  let sourceId = '';

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
    const requestBody = await req.json();
    feedUrl = requestBody.feedUrl || '';
    topicId = requestBody.topicId || '';
    sourceId = requestBody.sourceId || '';

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
    const multiTenantDbOps = new MultiTenantDatabaseOperations(supabase as any);

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

      // Competing regions now handled via weighted scoring in region-config.ts
      // No binary rejection - let the relevance score determine pass/fail

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

        console.log(`✅ PASSED FILTER: "${article.title.substring(0, 50)}..." | Relevance: ${relevanceScore.relevance_score}% | Method: ${relevanceScore.method}`);
        
        // Add detailed keyword matching debug info
        if (relevanceScore.method === 'keyword' && relevanceScore.details.keyword_matches) {
          console.log(`  Keyword matches:`, relevanceScore.details.keyword_matches);
          console.log(`  Topic keywords:`, topicConfig.keywords);
        }
        
        filteredArticlesWithScores.push(article);
      }
    }

    // Store using multi-tenant system only (no legacy dual-write)
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
        error: multiTenantError instanceof Error ? multiTenantError.message : String(multiTenantError),
        articlesProcessed: 0,
        newContentCreated: 0,
        topicArticlesCreated: 0,
        duplicatesSkipped: 0
      };
    }

    // Update source metrics with multi-tenant articles count  
    await dbOps.updateSourceMetrics(
      actualSourceId, 
      true, 
      'rss', 
      Date.now() - startTime, 
      multiTenantResult?.articlesProcessed || 0
    );

    // Log the operation with multi-tenant results only
    await dbOps.logSystemEvent('info', `Topic-aware scraping completed for ${topicData.name}`, {
      topic_id: topicId,
      topic_type: topicConfig.topic_type,
      source_id: actualSourceId,
      feed_url: feedUrl,
      articles_found: scrapingResult.articlesFound,
      articles_pre_filter: scrapingResult.articles.length,
      articles_filtered_out: discardedArticles.length,
      articles_passed_filter: filteredArticlesWithScores.length,
      // Multi-tenant results
      mt_success: multiTenantResult?.success || false,
      mt_processed: multiTenantResult?.articlesProcessed || 0,
      mt_new_content: multiTenantResult?.newContentCreated || 0,
      mt_topic_articles: multiTenantResult?.topicArticlesCreated || 0,
      mt_duplicates: multiTenantResult?.duplicatesSkipped || 0,
      // Configuration
      scoring_method: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
      negative_keywords_applied: topicData.negative_keywords?.length || 0,
      competing_regions_applied: topicData.competing_regions?.length || 0
    }, 'topic-aware-scraper');

    return new Response(JSON.stringify({
      success: true,
      topicName: topicData.name,
      topicType: topicConfig.topic_type,
      articlesFound: scrapingResult.articlesFound,
      articlesPreFilter: scrapingResult.articles.length,
      articlesFilteredOut: discardedArticles.length,
      articlesPassedFilter: filteredArticlesWithScores.length,
      // Multi-tenant results
      articlesProcessed: multiTenantResult?.articlesProcessed || 0,
      newContentCreated: multiTenantResult?.newContentCreated || 0,
      topicArticlesCreated: multiTenantResult?.topicArticlesCreated || 0,
      duplicatesSkipped: multiTenantResult?.duplicatesSkipped || 0,
      errors: multiTenantResult?.errors || [],
      scoringMethod: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
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
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});