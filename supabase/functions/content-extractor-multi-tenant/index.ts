import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractionRequest {
  urls: string[];
  topicId: string;
  sourceId?: string;
  maxConcurrent?: number;
  fallbackToScreenshot?: boolean;
}

interface ExtractionResult {
  success: boolean;
  totalUrls: number;
  articlesExtracted: number;
  articlesStored: number;
  duplicatesSkipped: number;
  errors: string[];
  extractionMethods: Record<string, number>;
  responseTime: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { urls, topicId, sourceId, maxConcurrent = 5, fallbackToScreenshot = true }: ExtractionRequest = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty urls array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: topicId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔄 Multi-tenant content extraction started: ${urls.length} URLs for topic ${topicId}`);

    const result: ExtractionResult = {
      success: false,
      totalUrls: urls.length,
      articlesExtracted: 0,
      articlesStored: 0,
      duplicatesSkipped: 0,
      errors: [],
      extractionMethods: {},
      responseTime: 0
    };

    const multiTenantDb = new MultiTenantDatabaseOperations(supabase);
    const extractedArticles = [];

    // Process URLs in batches to avoid overwhelming the system
    const batches = [];
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      batches.push(urls.slice(i, i + maxConcurrent));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(url => extractArticleContent(url, supabase, fallbackToScreenshot, sourceId));
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let i = 0; i < batchResults.length; i++) {
        const batchResult = batchResults[i];
        const url = batch[i];
        
        if (batchResult.status === 'fulfilled' && batchResult.value.success) {
          const extraction = batchResult.value;
          extractedArticles.push(extraction.article);
          result.articlesExtracted++;
          
          // Track extraction methods
          const method = extraction.method || 'unknown';
          result.extractionMethods[method] = (result.extractionMethods[method] || 0) + 1;
          
          console.log(`✅ Extracted: "${extraction.article.title}" via ${method}`);
        } else {
          const error = batchResult.status === 'rejected' 
            ? batchResult.reason.message 
            : batchResult.value?.error || 'Unknown error';
          result.errors.push(`${url}: ${error}`);
          console.log(`❌ Failed to extract: ${url} - ${error}`);
        }
      }
    }

    // Store extracted articles in multi-tenant database
    if (extractedArticles.length > 0) {
      console.log(`💾 Storing ${extractedArticles.length} articles in multi-tenant database`);
      
      // Filter out articles that look like index page content
      const validArticles = extractedArticles.filter(article => {
        const title = article.title.toLowerCase();
        const invalidTitlePatterns = [
          /latest news/,
          /headlines/,
          /breaking news/,
          /news index/,
          /all news/,
          /news home/,
          /news archive/,
          /\| news$/
        ];
        
        // Skip articles that look like index page titles
        const isInvalidTitle = invalidTitlePatterns.some(pattern => pattern.test(title));
        if (isInvalidTitle) {
          console.log(`🚫 Filtered out index page content: "${article.title}"`);
          return false;
        }
        
        // Skip articles with too little content (likely excerpts)
        if (article.body && article.body.length < 200) {
          console.log(`🚫 Filtered out short content: "${article.title}" (${article.body.length} chars)`);
          return false;
        }
        
        return true;
      });
      
      console.log(`✅ After filtering: ${validArticles.length}/${extractedArticles.length} articles are valid`);
      
      if (validArticles.length > 0) {
        const storageResult = await multiTenantDb.storeArticles(
          validArticles,
          topicId,
          sourceId
        );
        
        result.articlesStored = storageResult.topicArticlesCreated;
        result.duplicatesSkipped = storageResult.duplicatesSkipped;
        result.errors.push(...storageResult.errors.map(e => `Storage: ${e}`));
        
        console.log(`📊 Storage complete: ${result.articlesStored} stored, ${result.duplicatesSkipped} duplicates`);
      } else {
        result.errors.push('All extracted articles were filtered out as invalid content');
      }
    }

    result.success = result.articlesExtracted > 0;
    result.responseTime = Date.now() - startTime;

    // Log completion
    await supabase.from('system_logs').insert({
      level: result.success ? 'info' : 'warn',
      message: `Multi-tenant content extraction completed`,
      context: {
        topicId,
        sourceId,
        totalUrls: result.totalUrls,
        articlesExtracted: result.articlesExtracted,
        articlesStored: result.articlesStored,
        duplicatesSkipped: result.duplicatesSkipped,
        extractionMethods: result.extractionMethods,
        responseTime: result.responseTime,
        errorsCount: result.errors.length
      },
      function_name: 'content-extractor-multi-tenant'
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Multi-tenant content extraction error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      totalUrls: 0,
      articlesExtracted: 0,
      articlesStored: 0,
      duplicatesSkipped: 0,
      errors: [error.message],
      extractionMethods: {},
      responseTime: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function extractArticleContent(url: string, supabase: any, fallbackToScreenshot: boolean, sourceId?: string) {
  const extractionResult = {
    success: false,
    article: null,
    method: '',
    error: ''
  };

  try {
    // Method 1: Try RSS extraction first (if URL looks like RSS feed)
    if (isRssFeedUrl(url)) {
      console.log(`🔄 Trying RSS extraction for RSS URL: ${url}`);
      const rssResult = await tryRssExtraction(url);
      
      if (rssResult.success && rssResult.article) {
        extractionResult.success = true;
        extractionResult.article = rssResult.article;
        extractionResult.method = 'rss-direct';
        return extractionResult;
      }
    }

    // Method 2: Try direct HTML extraction
    console.log(`🔄 Trying HTML extraction for: ${url}`);
    const htmlResult = await tryHtmlExtraction(url);
    
    if (htmlResult.success && htmlResult.article) {
      extractionResult.success = true;
      extractionResult.article = htmlResult.article;
      extractionResult.method = 'html-parser';
      return extractionResult;
    }

    // Method 3: Try Beautiful Soup scraper
    console.log(`🔄 Trying Beautiful Soup for: ${url}`);
    const soupResult = await supabase.functions.invoke('beautiful-soup-scraper', {
      body: { 
        feedUrl: url,
        sourceId: sourceId || 'content-extractor',
        maxArticles: 1,
        individualArticle: true
      }
    });

    if (soupResult.data && !soupResult.error && soupResult.data.success && soupResult.data.articles?.length > 0) {
      extractionResult.success = true;
      extractionResult.article = soupResult.data.articles[0];
      extractionResult.method = 'beautiful-soup';
      return extractionResult;
    }

    // Method 4: Screenshot AI fallback (if enabled)
    if (fallbackToScreenshot) {
      console.log(`🔄 Trying screenshot AI for: ${url}`);
      const screenshotResult = await supabase.functions.invoke('screenshot-ai-scraper', {
        body: { 
          feedUrl: url,
          sourceId: sourceId || 'content-extractor',
          region: 'extraction'
        }
      });

      if (screenshotResult.data && !screenshotResult.error && 
          screenshotResult.data.success && screenshotResult.data.articlesExtracted > 0) {
        extractionResult.success = true;
        extractionResult.article = {
          title: screenshotResult.data.firstArticle?.title || 'Extracted Article',
          body: screenshotResult.data.firstArticle?.body || '',
          author: screenshotResult.data.firstArticle?.author,
          published_at: screenshotResult.data.firstArticle?.published_at,
          source_url: url,
          image_url: screenshotResult.data.firstArticle?.image_url,
          word_count: screenshotResult.data.firstArticle?.word_count || 0
        };
        extractionResult.method = 'screenshot-ai';
        return extractionResult;
      }
    }

    extractionResult.error = 'All extraction methods failed';
    return extractionResult;

  } catch (error) {
    extractionResult.error = error.message;
    return extractionResult;
  }
}

/**
 * Check if URL is likely an RSS feed
 */
function isRssFeedUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('/rss') || 
         lowerUrl.includes('/feed') || 
         lowerUrl.includes('.rss') || 
         lowerUrl.includes('.xml') ||
         lowerUrl.includes('/atom');
}

/**
 * Try extracting content directly from RSS feed URL
 */
async function tryRssExtraction(rssUrl: string) {
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    
    // Parse the first RSS item with full content check
    const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/i;
    const itemMatch = itemPattern.exec(xml);
    
    if (!itemMatch) {
      throw new Error('No RSS items found');
    }

    const itemContent = itemMatch[1];
    
    // Extract fields with preference for full content
    const linkMatch = /<link[^>]*>(.*?)<\/link>/i.exec(itemContent) || 
                     /<link[^>]*><!\[CDATA\[(.*?)\]\]><\/link>/i.exec(itemContent);
    const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(itemContent) || 
                      /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(itemContent);
    
    // Try multiple content fields in order of preference
    const contentMatch = /<content:encoded[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i.exec(itemContent) ||
                        /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i.exec(itemContent) ||
                        /<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i.exec(itemContent) ||
                        /<description[^>]*>([\s\S]*?)<\/description>/i.exec(itemContent);
    
    const dateMatch = /<pubDate[^>]*>(.*?)<\/pubDate>/i.exec(itemContent) ||
                     /<dc:date[^>]*>(.*?)<\/dc:date>/i.exec(itemContent);
    const authorMatch = /<dc:creator[^>]*>(.*?)<\/dc:creator>/i.exec(itemContent) ||
                       /<author[^>]*>(.*?)<\/author>/i.exec(itemContent);

    if (!linkMatch || !titleMatch || !contentMatch) {
      throw new Error('Missing required RSS fields');
    }

    // Clean and validate content
    let body = contentMatch[1]
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Require substantial content for RSS extraction (>300 chars indicates full article)
    if (body.length < 300) {
      throw new Error(`RSS content too short (${body.length} chars), likely a snippet`);
    }

    const title = titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    
    console.log(`✅ RSS extraction successful: "${title}" (${body.length} chars)`);

    return {
      success: true,
      article: {
        title,
        body,
        author: authorMatch ? authorMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : undefined,
        published_at: parseRssDateSafe(dateMatch ? dateMatch[1].trim() : ''),
        source_url: linkMatch[1].trim(),
        word_count: body.split(/\s+/).length
      }
    };
    
  } catch (error) {
    console.log(`RSS extraction failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Safe RSS date parsing that handles invalid dates
 */
function parseRssDateSafe(dateString: string): string | undefined {
  if (!dateString || dateString.trim() === '') {
    return undefined;
  }
  
  // Handle common invalid dates
  const cleanDate = dateString.trim();
  if (['Daily', 'Weekly', 'Monthly', 'N/A', 'TBD'].includes(cleanDate)) {
    return undefined;
  }
  
  try {
    const date = new Date(cleanDate);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    
    // Check if date is reasonable (not too far in future/past)
    const now = new Date();
    const yearsDiff = Math.abs(now.getFullYear() - date.getFullYear());
    
    if (yearsDiff > 10) {
      return undefined;
    }
    
    return date.toISOString();
  } catch (error) {
    return undefined;
  }
}

async function tryHtmlExtraction(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const article = parseArticleFromHtml(html, url);
    
    if (article && article.title && article.body && article.body.length > 100) {
      return { success: true, article };
    } else {
      return { success: false, error: 'Insufficient content extracted' };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function parseArticleFromHtml(html: string, url: string) {
  try {
    // Extract title
    let title = '';
    const titlePatterns = [
      /<title>([^<]+)<\/title>/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        title = match[1].trim();
        break;
      }
    }

    // Extract main content
    let body = '';
    const contentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class\s*=\s*["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class\s*=\s*["'][^"']*post[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
    ];
    
    for (const pattern of contentPatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        body = match[1]
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (body.length > 100) break;
      }
    }

    // Extract author
    let author = '';
    const authorPatterns = [
      /<meta[^>]*name\s*=\s*["']author["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      /<span[^>]*class\s*=\s*["'][^"']*author[^"']*["'][^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class\s*=\s*["'][^"']*byline[^"']*["'][^>]*>[\s\S]*?([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    ];
    
    for (const pattern of authorPatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        author = match[1].trim();
        break;
      }
    }

    // Extract publication date
    let published_at = '';
    const datePatterns = [
      /<time[^>]*datetime\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]*property\s*=\s*["']article:published_time["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
      /(\d{4}-\d{2}-\d{2})/,
    ];
    
    for (const pattern of datePatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        published_at = match[1];
        break;
      }
    }

    // Extract image
    let image_url = '';
    const imagePatterns = [
      /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      /<img[^>]*src\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*featured[^"']*["']/i,
    ];
    
    for (const pattern of imagePatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        image_url = match[1];
        break;
      }
    }

    return {
      title,
      body,
      author: author || undefined,
      published_at: published_at || undefined,
      source_url: url,
      image_url: image_url || undefined,
      word_count: body ? body.split(/\s+/).length : 0
    };
    
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return null;
  }
}