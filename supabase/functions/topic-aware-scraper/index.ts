import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { EnhancedScrapingStrategies } from '../_shared/enhanced-scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';
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

    const startTime = Date.now();

    // Perform scraping using unified strategy
    console.log(`Starting scraping for topic: ${topicConfig.topic_type} - ${topicData.name}`);
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

    // VOLUME-FIRST APPROACH: Score ALL articles but store them all
    const allArticlesWithScores = scrapingResult.articles.map(article => {
      const relevanceScore = calculateTopicRelevance(
        article.body, 
        article.title, 
        topicConfig,
        sourceInfo.source_type || 'national',
        otherRegionalTopics
      );

      // Add comprehensive scoring metadata but DON'T filter
      article.regional_relevance_score = relevanceScore.relevance_score;
      article.import_metadata = {
        ...article.import_metadata,
        topic_relevance: relevanceScore,
        topic_id: topicId,
        topic_type: topicConfig.topic_type,
        filtering_method: relevanceScore.method,
        scrape_approach: 'volume_first'
      };

      console.log(`Article "${article.title.substring(0, 50)}..." relevance: ${relevanceScore.relevance_score}% - STORING ALL ARTICLES`);
      
      // Add detailed keyword matching debug info
      if (relevanceScore.method === 'keyword' && relevanceScore.details.keyword_matches) {
        console.log(`  Keyword matches:`, relevanceScore.details.keyword_matches);
        console.log(`  Topic keywords:`, topicConfig.keywords);
      }
      
      return article;
    });

    // Store ALL articles with their scores
    const { stored, duplicates, discarded } = await dbOps.storeArticles(
      allArticlesWithScores,
      actualSourceId,
      topicConfig.region || 'general',
      topicId
    );

    console.log(`📊 VOLUME-FIRST Storage - Stored: ${stored}, Duplicates: ${duplicates}, Discarded: ${discarded}`);

    // Update source metrics
    await dbOps.updateSourceMetrics(actualSourceId, true, 'rss', Date.now() - startTime);

    // Log the operation
    await dbOps.logSystemEvent('info', `Topic-aware scraping completed for ${topicData.name}`, {
      topic_id: topicId,
      topic_type: topicConfig.topic_type,
      source_id: actualSourceId,
      feed_url: feedUrl,
      articles_found: scrapingResult.articlesFound,
      articles_with_scores: allArticlesWithScores.length,
      articles_stored: stored,
      duplicates_detected: duplicates,
      articles_discarded: discarded,
      scoring_method: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
      approach: 'volume_first'
    }, 'topic-aware-scraper');

    return new Response(JSON.stringify({
      success: true,
      topicName: topicData.name,
      topicType: topicConfig.topic_type,
      articlesFound: scrapingResult.articlesFound,
      articlesWithScores: allArticlesWithScores.length,
      articlesStored: stored,
      duplicatesDetected: duplicates,
      articlesDiscarded: discarded,
      scoringMethod: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching',
      approach: 'volume_first'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in topic-aware-scraper:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});