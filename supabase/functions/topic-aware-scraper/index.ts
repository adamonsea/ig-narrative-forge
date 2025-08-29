import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { EnhancedScrapingStrategies } from '../_shared/enhanced-scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';
import { calculateTopicRelevance, getRelevanceThreshold } from '../_shared/hybrid-content-scoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TopicConfig {
  id: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
}

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

  // Use the provided sourceId (source already exists in database)
  const actualSourceId = sourceId;

    // Initialize scraping components
    const scrapingStrategies = new EnhancedScrapingStrategies();
    const dbOps = new DatabaseOperations(supabase);

    const startTime = Date.now();

    // Perform scraping
    console.log(`Starting scraping for topic: ${topicConfig.topic_type} - ${topicData.name}`);
    const scrapingResult = await scrapingStrategies.scrapeContent({
      method: 'rss',
      url: feedUrl,
      retryAttempts: 3,
      timeout: 30000,
      userAgent: 'eeZee News Scraper 1.0'
    }, topicConfig.region || 'general');

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

    // Apply topic-aware filtering
    const relevantArticles = scrapingResult.articles.filter(article => {
      const relevanceScore = calculateTopicRelevance(
        article.body, 
        article.title, 
        topicConfig,
        'national' // Default source type, could be enhanced
      );

      const threshold = getRelevanceThreshold(topicConfig.topic_type, 'national');
      const isRelevant = relevanceScore.relevance_score >= threshold;

      // Add scoring metadata
      article.regional_relevance_score = relevanceScore.relevance_score;
      article.import_metadata = {
        ...article.import_metadata,
        topic_relevance: relevanceScore,
        topic_id: topicId,
        topic_type: topicConfig.topic_type,
        filtering_method: relevanceScore.method
      };

      console.log(`Article "${article.title}" relevance: ${relevanceScore.relevance_score}% (threshold: ${threshold}%) - ${isRelevant ? 'ACCEPTED' : 'REJECTED'}`);
      
      return isRelevant;
    });

    // Store relevant articles
    const { stored, duplicates, discarded } = await dbOps.storeArticles(
      relevantArticles,
      actualSourceId,
      topicConfig.region || 'general'
    );

    // Update source metrics
    await dbOps.updateSourceMetrics(actualSourceId, true, 'rss', Date.now() - startTime);

    // Log the operation
    await dbOps.logSystemEvent('info', `Topic-aware scraping completed for ${topicData.name}`, {
      topic_id: topicId,
      topic_type: topicConfig.topic_type,
      source_id: actualSourceId,
      feed_url: feedUrl,
      articles_found: scrapingResult.articlesFound,
      articles_relevant: relevantArticles.length,
      articles_stored: stored,
      duplicates_detected: duplicates,
      articles_discarded: discarded,
      filtering_method: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching'
    }, 'topic-aware-scraper');

    return new Response(JSON.stringify({
      success: true,
      topicName: topicData.name,
      topicType: topicConfig.topic_type,
      articlesFound: scrapingResult.articlesFound,
      articlesRelevant: relevantArticles.length,
      articlesStored: stored,
      duplicatesDetected: duplicates,
      articlesDiscarded: discarded,
      filteringMethod: topicConfig.topic_type === 'regional' ? 'regional_relevance' : 'keyword_matching'
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