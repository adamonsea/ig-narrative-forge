import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { BeautifulSoupParser } from '../_shared/beautiful-soup-parser.ts';
import { ArticleData, ScrapingResult } from '../_shared/types.ts';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BeautifulSoupRequest {
  feedUrl: string;
  sourceId?: string;
  topicId?: string;
  region?: string;
  maxArticles?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🍲 Beautiful Soup Scraper starting...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { feedUrl, sourceId, topicId, region, maxArticles = 25 }: BeautifulSoupRequest = await req.json();

    if (!feedUrl) {
      throw new Error('feedUrl is required');
    }

    console.log(`🎯 Beautiful Soup scraping: ${feedUrl}`);

    // Fetch the webpage
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 Fetched ${html.length} characters of HTML`);

    // Initialize Beautiful Soup parser
    const parser = new BeautifulSoupParser(html, feedUrl);

    // Try RSS feeds first (Beautiful Soup approach)
    const rssFeeds = parser.findRSSFeeds();
    const articles: ArticleData[] = [];
    const errors: string[] = [];
    let articlesFound = 0;

    // Try RSS feeds if found
    if (rssFeeds.length > 0) {
      console.log(`📡 Found ${rssFeeds.length} RSS feeds, trying RSS first...`);
      
      for (const rssUrl of rssFeeds.slice(0, 2)) { // Try up to 2 RSS feeds
        try {
          const rssResult = await tryRSSExtraction(rssUrl, sourceId, topicId, region);
          if (rssResult.success && rssResult.articles.length > 0) {
            articles.push(...rssResult.articles.slice(0, maxArticles));
            console.log(`✅ RSS extraction successful: ${rssResult.articles.length} articles`);
            break; // Success with RSS, no need to try HTML parsing
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ RSS feed failed: ${rssUrl} - ${errorMessage}`);
          errors.push(`RSS failed: ${errorMessage}`);
        }
      }
    }

    // If RSS failed or no RSS found, try Beautiful Soup HTML parsing
    if (articles.length === 0) {
      console.log('🔍 RSS failed or not found, trying Beautiful Soup HTML parsing...');
      
      try {
        // Get article links using Beautiful Soup approach
        const articleLinks = parser.findArticleLinks();
        articlesFound = articleLinks.length;
        
        console.log(`🔗 Beautiful Soup found ${articlesFound} article links`);

        // Process each article link
        for (const articleUrl of articleLinks.slice(0, maxArticles)) {
          try {
            const articleResult = await extractArticleContent(articleUrl, sourceId, topicId, region);
            if (articleResult) {
              articles.push(articleResult);
              console.log(`✅ Extracted: ${articleResult.title?.substring(0, 60)}...`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`❌ Article extraction failed: ${articleUrl} - ${errorMessage}`);
            errors.push(`Article failed: ${errorMessage}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ Beautiful Soup HTML parsing failed: ${errorMessage}`);
        errors.push(`HTML parsing failed: ${errorMessage}`);
      }
    }

    // Store articles in database
    let storedCount = 0;
    let duplicateCount = 0;
    let discardedCount = 0;

    if (articles.length > 0) {
      for (const article of articles) {
        try {
          // Check for duplicates
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('source_url', article.source_url)
            .single();

          if (existingArticle) {
            duplicateCount++;
            continue;
          }

          // Store article
          const { error } = await supabase
            .from('articles')
            .insert(article);

          if (error) {
            console.log(`❌ Database insert failed: ${error.message}`);
            discardedCount++;
          } else {
            storedCount++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ Article processing failed: ${errorMessage}`);
          discardedCount++;
        }
      }
    }

    // Update source statistics
    if (sourceId) {
      await supabase
        .from('content_sources')
        .update({
          last_scraped_at: new Date().toISOString(),
          articles_scraped: storedCount,
          success_rate: articles.length > 0 ? 100 : 0,
          scraping_method: 'beautiful_soup'
        })
        .eq('id', sourceId);
    }

    const result: ScrapingResult = {
      success: articles.length > 0,
      articles,
      articlesFound,
      articlesScraped: storedCount,
      errors,
      method: 'html'
    };

    console.log(`🍲 Beautiful Soup scraping completed:`);
    console.log(`   📊 Found: ${articlesFound}, Stored: ${storedCount}, Duplicates: ${duplicateCount}, Discarded: ${discardedCount}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Beautiful Soup scraper error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      articles: [],
      articlesFound: 0,
      articlesScraped: 0,
      errors: [errorMessage],
      method: 'beautiful_soup'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to try RSS extraction
async function tryRSSExtraction(rssUrl: string, sourceId?: string, topicId?: string, region?: string): Promise<ScrapingResult> {
  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +https://example.com/bot)'
    }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const rssText = await response.text();
  const articles: ArticleData[] = [];

  // Parse RSS/Atom (simplified)
  const itemMatches = rssText.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];

  for (const itemMatch of itemMatches.slice(0, 25)) {
    const title = extractXMLContent(itemMatch, 'title');
    const link = extractXMLContent(itemMatch, 'link') || extractXMLContent(itemMatch, 'guid');
    const description = extractXMLContent(itemMatch, 'description') || extractXMLContent(itemMatch, 'summary');
    const author = extractXMLContent(itemMatch, 'author') || extractXMLContent(itemMatch, 'dc:creator');
    const pubDate = extractXMLContent(itemMatch, 'pubDate') || extractXMLContent(itemMatch, 'published');

    if (title && link) {
      const fullUrl = new URL(link, rssUrl).href;
      
      // Enhanced content extraction for RSS items
      let body = description || '';
      try {
        // Try to fetch full article content
        const articleContent = await extractArticleContent(fullUrl, sourceId, topicId, region);
        if (articleContent) {
          body = articleContent.body || body;
        }
      } catch {
        // Use RSS description as fallback
      }

      const wordCount = body ? body.split(/\s+/).length : 0;
      if (body && wordCount >= 15) { // Word-based validation
        articles.push({
          title,
          body,
          author,
          published_at: pubDate || new Date().toISOString(),
          source_url: fullUrl,
          canonical_url: fullUrl,
          word_count: body.split(/\s+/).length,
          regional_relevance_score: calculateRegionalRelevance(body, title, region),
          content_quality_score: calculateContentQuality(body, title),
          processing_status: 'new' as const,
          import_metadata: {
            extraction_method: 'html',
            scrape_timestamp: new Date().toISOString(),
            extractor_version: '2.0'
          }
        });
      }
    }
  }

  return {
    success: articles.length > 0,
    articles,
    articlesFound: itemMatches.length,
    articlesScraped: articles.length,
    errors: [],
    method: 'rss'
  };
}

// Helper function to extract article content
async function extractArticleContent(url: string, sourceId?: string, topicId?: string, region?: string): Promise<ArticleData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new BeautifulSoupParser(html, url);
    const content = parser.extractMainContent();

    // WORD-BASED VALIDATION: 150+ words for local news
    const wordCount = content.body ? content.body.split(/\s+/).length : 0;
    if (!content.body || wordCount < 25) { // Initial threshold, final validation in database-operations
      return null;
    }

    return {
      title: content.title,
      body: content.body,
      author: content.author,
      published_at: content.published_at,
      source_url: url,
      canonical_url: url,
      word_count: content.word_count,
      regional_relevance_score: calculateRegionalRelevance(content.body, content.title, region),
      content_quality_score: content.content_quality_score,
      processing_status: 'new' as const,
      import_metadata: {
        extraction_method: 'html',
        scrape_timestamp: new Date().toISOString(),
        extractor_version: '2.0'
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`❌ Article extraction failed: ${url} - ${errorMessage}`);
    return null;
  }
}

// Helper functions
function extractXMLContent(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([^<]+)`, 'i').exec(xml) ||
                new RegExp(`<${tag}[^>]*><\\!\\[CDATA\\[([^\\]]+)`, 'i').exec(xml);
  return match ? match[1].trim() : '';
}

function calculateRegionalRelevance(content: string, title: string, region?: string): number {
  if (!region) return 50;
  
  const text = `${title} ${content}`.toLowerCase();
  const regionLower = region.toLowerCase();
  
  let score = 10;
  if (text.includes(regionLower)) score += 30;
  if (text.includes('local')) score += 15;
  if (text.includes('council') || text.includes('borough')) score += 10;
  
  return Math.min(100, score);
}

function calculateContentQuality(content: string, title: string): number {
  const wordCount = content.split(/\s+/).length;
  let score = 30;
  
  if (wordCount > 100) score += 20;
  if (wordCount > 300) score += 20;
  if (title.length > 10) score += 10;
  if (content.includes('.') && content.includes(',')) score += 10;
  if (wordCount > 500) score += 10;
  
  return Math.min(100, score);
}