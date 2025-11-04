import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculateTopicRelevance, meetsTopicRelevance } from '../_shared/hybrid-content-scoring.ts';
import type { TopicConfig } from '../_shared/hybrid-content-scoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillRequest {
  topicId: string;
  maxAgeDays?: number; // How far back to look for orphaned articles
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { topicId, maxAgeDays = 30 } = await req.json() as BackfillRequest;

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'topicId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔗 Starting backfill for topic ${topicId}, looking back ${maxAgeDays} days`);

    // 1. Fetch topic configuration
    const { data: topic, error: topicError } = await supabaseClient
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      return new Response(
        JSON.stringify({ error: `Topic not found: ${topicError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Build topic config for scoring
    const topicConfig: TopicConfig = {
      id: topic.id,
      topic_type: topic.topic_type,
      keywords: topic.keywords || [],
      negative_keywords: topic.negative_keywords || [],
      region: topic.region,
      landmarks: topic.landmarks || [],
      postcodes: topic.postcodes || [],
      organizations: topic.organizations || [],
      competing_regions: topic.competing_regions || []
    };

    // 3. Find orphaned articles: in shared_article_content but NOT in topic_articles for this topic
    const ageThreshold = new Date();
    ageThreshold.setDate(ageThreshold.getDate() - maxAgeDays);

    // Get all shared content that matches keywords (basic pre-filter)
    const keywordPattern = topicConfig.keywords.length > 0 
      ? `%(${topicConfig.keywords.join('|')})%` 
      : '%'; // If no keywords, consider all

    const { data: sharedContent, error: contentError } = await supabaseClient
      .from('shared_article_content')
      .select('*')
      .gte('published_at', ageThreshold.toISOString())
      .order('published_at', { ascending: false })
      .limit(500); // Reasonable limit for backfill

    if (contentError) {
      console.error('Error fetching shared content:', contentError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch content: ${contentError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📚 Found ${sharedContent?.length || 0} recent articles in shared content`);

    // 4. Filter out articles already linked to this topic
    const { data: existingLinks } = await supabaseClient
      .from('topic_articles')
      .select('shared_content_id')
      .eq('topic_id', topicId);

    const existingContentIds = new Set(existingLinks?.map(l => l.shared_content_id) || []);
    const orphanedArticles = sharedContent?.filter(article => 
      !existingContentIds.has(article.id)
    ) || [];

    console.log(`🔍 Found ${orphanedArticles.length} orphaned articles not linked to topic`);

    // 5. Score and filter orphaned articles using same logic as scraper
    const qualifiedArticles: Array<{
      article: any;
      relevanceScore: number;
      qualityScore: number;
    }> = [];

    for (const article of orphanedArticles) {
      const content = article.body || '';
      const title = article.title || '';

      // Check if it meets relevance threshold
      const meetsRelevance = meetsTopicRelevance(
        content,
        title,
        topicConfig,
        'national', // Default source type for backfill
        [], // No competing topics needed for backfill
        article.url,
        false // Not user-selected
      );

      if (!meetsRelevance) {
        continue;
      }

      // Calculate scores
      const scoreResult = calculateTopicRelevance(
        content,
        title,
        topicConfig,
        'national',
        [],
        article.url
      );

      const qualityScore = calculateQualityScore(article);

      // Apply same thresholds as scraper
      const qualityThreshold = 30;
      const relevanceThreshold = topicConfig.topic_type === 'keyword' ? 2 : 3;

      if (scoreResult.relevance_score >= relevanceThreshold && qualityScore >= qualityThreshold) {
        qualifiedArticles.push({
          article,
          relevanceScore: scoreResult.relevance_score,
          qualityScore
        });
        console.log(`✅ Qualified: "${title.substring(0, 60)}..." (R:${scoreResult.relevance_score}, Q:${qualityScore})`);
      }
    }

    console.log(`🎯 ${qualifiedArticles.length} articles qualified for linkage`);

    // 6. Create topic_articles entries for qualified orphans
    const linkedArticles: any[] = [];
    for (const { article, relevanceScore, qualityScore } of qualifiedArticles) {
      const { data: topicArticle, error: linkError } = await supabaseClient
        .from('topic_articles')
        .insert({
          shared_content_id: article.id,
          topic_id: topicId,
          source_id: null, // Unknown source for backfilled content
          regional_relevance_score: relevanceScore,
          content_quality_score: qualityScore,
          keyword_matches: findKeywordMatches(article, topicConfig),
          processing_status: 'new', // Surface in Arrivals
          import_metadata: {
            backfill: true,
            backfill_timestamp: new Date().toISOString(),
            method: 'backfill-topic-linkage'
          },
          originality_confidence: 100
        })
        .select()
        .single();

      if (linkError) {
        console.error(`Failed to link article ${article.id}:`, linkError);
      } else {
        linkedArticles.push(topicArticle);
        console.log(`🔗 Linked: "${article.title.substring(0, 60)}..."`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        topicId,
        articlesScanned: orphanedArticles.length,
        articlesQualified: qualifiedArticles.length,
        articlesLinked: linkedArticles.length,
        details: linkedArticles.map(a => ({
          title: sharedContent?.find(s => s.id === a.shared_content_id)?.title,
          relevance: a.regional_relevance_score,
          quality: a.content_quality_score
        }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Calculate quality score (simplified from multi-tenant-database-operations)
function calculateQualityScore(article: any): number {
  let score = 0;
  
  // Word count scoring
  const wordCount = article.word_count || 0;
  if (wordCount >= 300) score += 30;
  else if (wordCount >= 200) score += 20;
  else if (wordCount >= 100) score += 10;
  
  // Has author
  if (article.author && article.author.trim().length > 0) score += 20;
  
  // Has image
  if (article.image_url) score += 10;
  
  // Published date present
  if (article.published_at) score += 10;
  
  return Math.min(100, score);
}

// Helper: Find keyword matches
function findKeywordMatches(article: any, topicConfig: TopicConfig): string[] {
  const text = `${article.title || ''} ${article.body || ''}`.toLowerCase();
  const matches: string[] = [];
  
  for (const keyword of topicConfig.keywords) {
    if (text.includes(keyword.toLowerCase())) {
      matches.push(keyword);
    }
  }
  
  return matches;
}
