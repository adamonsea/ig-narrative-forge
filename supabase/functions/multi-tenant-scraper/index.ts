import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapingResult {
  success: boolean;
  articlesFound: number;
  articlesScraped: number;
  newContentCreated: number;
  topicArticlesCreated: number;
  errors: string[];
  method: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { feedUrl, topicId, sourceId, articles } = await req.json();

    console.log('🧪 Multi-tenant scraper test started:', {
      topicId, sourceId, articlesCount: articles?.length || 0
    });

    if (!topicId || !articles || !Array.isArray(articles)) {
      throw new Error('Missing required parameters: topicId and articles array');
    }

    const { data: topic, error: topicError } = await supabase
      .from('topics').select('*').eq('id', topicId).single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    const result: ScrapingResult = {
      success: true, articlesFound: articles.length, articlesScraped: 0,
      newContentCreated: 0, topicArticlesCreated: 0, errors: [], method: 'multi-tenant-test'
    };

    for (const article of articles) {
      try {
        const normalizedUrl = normalizeUrl(article.source_url);
        const wordCount = calculateWordCount(article.body || '');
        const relevanceScore = calculateRelevanceScore(article, topic);
        const qualityScore = calculateQualityScore(article);

        console.log(`Processing: "${article.title}" - Quality: ${qualityScore}, Relevance: ${relevanceScore}, Words: ${wordCount}`);

        // Skip articles that are clearly snippets or too low quality
        if (wordCount < 100 || isContentSnippet(article.body || '', article.title || '')) {
          console.log(`⚠️ Skipping snippet/low-quality article: ${article.title}`);
          continue;
        }

        // Skip articles older than 1 week
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const articleDate = article.published_at ? new Date(article.published_at) : new Date();
        if (articleDate < oneWeekAgo) {
          console.log(`⏰ Skipping article older than 1 week: ${article.title} (${articleDate.toISOString()})`);
          continue;
        }

        const { data: existingContent } = await supabase
          .from('shared_article_content').select('id').eq('normalized_url', normalizedUrl).maybeSingle();

        let sharedContentId;

        if (existingContent) {
          sharedContentId = existingContent.id;
          await supabase.from('shared_article_content')
            .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', sharedContentId);
        } else {
          const { data: newContent, error: insertError } = await supabase
            .from('shared_article_content').insert({
              url: article.source_url, normalized_url: normalizedUrl, title: article.title,
              body: article.body, author: article.author, image_url: article.image_url,
              published_at: article.published_at, word_count: wordCount,
              source_domain: extractDomain(article.source_url),
              content_checksum: generateChecksum(article.title + article.body)
            }).select('id').single();

          if (insertError) throw insertError;
          sharedContentId = newContent.id;
          result.newContentCreated++;
        }

        await supabase.from('topic_articles').insert({
          shared_content_id: sharedContentId, topic_id: topicId, source_id: sourceId,
          regional_relevance_score: relevanceScore, content_quality_score: qualityScore,
          keyword_matches: findKeywordMatches(article, topic),
          processing_status: qualityScore >= 60 && relevanceScore >= 5 && wordCount >= 150 ? 'processed' : 'new',
          import_metadata: { test_run: true, source_url: article.source_url, processed_at: new Date().toISOString() }
        });

        result.articlesScraped++;
        result.topicArticlesCreated++;

      } catch (articleError) {
        console.error('Error processing article:', articleError);
        result.errors.push(`Article error: ${articleError.message}`);
      }
    }

    // Update source metrics properly
    if (sourceId) {
      const { error: updateError } = await supabase
        .from('content_sources')
        .update({
          articles_scraped: supabase.sql`COALESCE(articles_scraped, 0) + ${result.articlesScraped}`,
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          success_count: supabase.sql`COALESCE(success_count, 0) + 1`
        })
        .eq('id', sourceId);
        
      if (updateError) {
        console.error('Failed to update source metrics:', updateError);
      } else {
        console.log(`✅ Updated source metrics: +${result.articlesScraped} articles`);
      }
    }

    console.log('✅ Multi-tenant test completed:', result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Multi-tenant test failed:', error);
    return new Response(JSON.stringify({
      success: false, articlesFound: 0, articlesScraped: 0, newContentCreated: 0,
      topicArticlesCreated: 0, errors: [error.message], method: 'multi-tenant-test'
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function calculateWordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function calculateRelevanceScore(article: any, topic: any): number {
  if (!topic.keywords || topic.keywords.length === 0) return 50;
  const content = `${article.title} ${article.body}`.toLowerCase();
  const matches = topic.keywords.filter(keyword => content.includes(keyword.toLowerCase())).length;
  return Math.min(100, 20 + (matches * 15));
}

function calculateQualityScore(article: any): number {
  let score = 0;
  const wordCount = calculateWordCount(article.body || '');
  if (wordCount >= 500) score += 50;
  else if (wordCount >= 300) score += 40;
  else if (wordCount >= 200) score += 35;
  else if (wordCount >= 150) score += 30;
  else if (wordCount >= 100) score += 25;
  else if (wordCount >= 50) score += 15;
  else if (wordCount >= 25) score += 10;
  
  if (article.author && article.author.length > 0) score += 15;
  if (article.published_at) score += 15;
  if (article.title && article.title.length >= 20) score += 15;
  else if (article.title && article.title.length >= 10) score += 10;
  if (article.image_url) score += 5;
  
  // Penalty for snippets
  if (isContentSnippet(article.body || '', article.title || '')) {
    score -= 30;
  }
  
  return Math.min(100, score);
}

function isContentSnippet(content: string, title: string): boolean {
  if (!content) return true;
  
  const wordCount = calculateWordCount(content);
  
  // Too short to be full article
  if (wordCount < 100) return true;
  
  // Check for common snippet indicators
  const snippetIndicators = [
    'read more', 'continue reading', 'full story', 'view more',
    'the post', 'appeared first', 'original article', 'source:',
    'click here', 'see more', '...', 'read the full',
    'subscribe', 'follow us', 'newsletter'
  ];
  
  const contentLower = content.toLowerCase();
  const hasSnippetIndicators = snippetIndicators.some(indicator => 
    contentLower.includes(indicator)
  );
  
  // Check if content ends abruptly (common in RSS snippets)
  const endsAbruptly = content.trim().endsWith('...') || 
                       content.trim().endsWith('…') ||
                       !content.includes('.') || // No sentences
                       content.split('.').length < 3; // Very few sentences
  
  return hasSnippetIndicators || endsAbruptly;
}

function findKeywordMatches(article: any, topic: any): string[] {
  if (!topic.keywords || topic.keywords.length === 0) return [];
  const content = `${article.title} ${article.body}`.toLowerCase();
  return topic.keywords.filter(keyword => content.includes(keyword.toLowerCase()));
}

function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}