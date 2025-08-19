import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapeResult {
  success: boolean;
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: 'rss' | 'simple_html' | 'fallback';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region = 'Eastbourne' } = await req.json();
    console.log(`🚀 Starting hybrid scrape for: ${feedUrl}`);
    
    const startTime = Date.now();
    let result: ScrapeResult;

    // Strategy 1: Try RSS/Atom first (most reliable)
    result = await tryRSSParsing(feedUrl);
    
    // Strategy 2: If RSS fails, try simple HTML parsing
    if (!result.success) {
      console.log('📄 RSS failed, trying HTML parsing...');
      result = await trySimpleHTMLParsing(feedUrl);
    }
    
    // Strategy 3: Fallback to basic content extraction
    if (!result.success) {
      console.log('🔧 HTML parsing failed, trying fallback method...');
      result = await tryFallbackMethod(feedUrl);
    }

    if (!result.success) {
      throw new Error('All scraping methods failed - no articles found');
    }

    console.log(`✅ Found ${result.articlesFound} articles using ${result.method}`);

    // Filter and store articles
    const storedCount = await storeArticles(result.articles, sourceId, region, supabase);
    
    // Update source metrics
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await updateSourceMetrics(sourceId, result.success, result.method, responseTime, supabase);
    }

    const finalResult = {
      ...result,
      articlesScraped: storedCount,
      duration_ms: Date.now() - startTime
    };

    console.log(`🎉 Hybrid scrape completed:`, finalResult);
    
    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Hybrid scraper error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'none'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Strategy 1: RSS/Atom parsing (most reliable)
async function tryRSSParsing(feedUrl: string): Promise<ScrapeResult & { articles?: any[] }> {
  try {
    console.log('🔍 Attempting RSS parsing...');
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'LocalNewsBot/2.0 (News Aggregator)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      },
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    
    // Check if it's actually XML/RSS content
    if (!content.includes('<rss') && !content.includes('<feed') && !content.includes('<item') && !content.includes('<entry')) {
      throw new Error('Not RSS/XML content');
    }

    const articles = parseRSSContent(content);
    
    if (articles.length === 0) {
      throw new Error('No articles found in RSS feed');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0, // Will be updated later
      errors: [],
      method: 'rss',
      articles
    };

  } catch (error) {
    console.log(`❌ RSS parsing failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`RSS parsing failed: ${error.message}`],
      method: 'rss'
    };
  }
}

// Strategy 2: Simple HTML parsing
async function trySimpleHTMLParsing(feedUrl: string): Promise<ScrapeResult & { articles?: any[] }> {
  try {
    console.log('🌐 Attempting HTML parsing...');
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 20000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const articles = extractArticlesFromHTML(html, feedUrl);
    
    if (articles.length === 0) {
      throw new Error('No articles found in HTML content');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0,
      errors: [],
      method: 'simple_html',
      articles
    };

  } catch (error) {
    console.log(`❌ HTML parsing failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`HTML parsing failed: ${error.message}`],
      method: 'simple_html'
    };
  }
}

// Strategy 3: Fallback method for difficult sites
async function tryFallbackMethod(feedUrl: string): Promise<ScrapeResult & { articles?: any[] }> {
  try {
    console.log('🔧 Attempting fallback method...');
    
    // Try to find RSS/XML links in the main page
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/2.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Look for RSS/Atom feed links
    const feedLinks = extractFeedLinks(html, feedUrl);
    
    for (const feedLink of feedLinks) {
      console.log(`🔍 Trying discovered feed: ${feedLink}`);
      const rssResult = await tryRSSParsing(feedLink);
      if (rssResult.success) {
        return { ...rssResult, method: 'fallback' };
      }
    }
    
    // Last resort: try basic content extraction
    const articles = extractBasicContent(html, feedUrl);
    
    if (articles.length === 0) {
      throw new Error('No content could be extracted');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0,
      errors: [],
      method: 'fallback',
      articles
    };

  } catch (error) {
    console.log(`❌ Fallback method failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`Fallback method failed: ${error.message}`],
      method: 'fallback'
    };
  }
}

// Parse RSS/Atom content
function parseRSSContent(content: string): any[] {
  const articles: any[] = [];
  
  // Handle both RSS <item> and Atom <entry> tags
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  
  while ((match = itemRegex.exec(content)) !== null) {
    const itemContent = match[1];
    
    const title = extractXMLContent(itemContent, 'title');
    const link = extractXMLContent(itemContent, 'link') || extractLinkHref(itemContent);
    const description = extractXMLContent(itemContent, 'description') || 
                      extractXMLContent(itemContent, 'summary') ||
                      extractXMLContent(itemContent, 'content');
    const pubDate = extractXMLContent(itemContent, 'pubDate') || 
                   extractXMLContent(itemContent, 'published') ||
                   extractXMLContent(itemContent, 'updated');
    const author = extractXMLContent(itemContent, 'author') || 
                  extractXMLContent(itemContent, 'dc:creator') ||
                  extractAuthorName(itemContent);
    
    if (title && link) {
      articles.push({
        title: cleanHTML(title).trim(),
        body: description ? cleanHTML(description).trim() : '',
        source_url: link.trim(),
        published_at: parseDate(pubDate) || new Date().toISOString(),
        author: author ? cleanHTML(author).trim() : null,
        summary: description ? cleanHTML(description).substring(0, 200) + '...' : null
      });
    }
    
    if (articles.length >= 10) break; // Limit to prevent memory issues
  }
  
  return articles;
}

// Extract articles from HTML using common patterns
function extractArticlesFromHTML(html: string, baseUrl: string): any[] {
  const articles: any[] = [];
  
  // Common article selectors
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*news[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const pattern of articlePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && articles.length < 5) {
      const articleHTML = match[1];
      
      const title = extractFromHTML(articleHTML, [
        /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i,
        /<title>(.*?)<\/title>/i,
        /<div[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/div>/i
      ]);
      
      const content = extractFromHTML(articleHTML, [
        /<p[^>]*>(.*?)<\/p>/gi,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/i
      ]);
      
      const link = extractFromHTML(articleHTML, [
        /<a[^>]*href="([^"]*)"[^>]*>/i
      ]);

      if (title && content) {
        articles.push({
          title: cleanHTML(title).trim(),
          body: cleanHTML(content).trim(),
          source_url: resolveURL(link || baseUrl, baseUrl),
          published_at: new Date().toISOString(),
          author: null,
          summary: cleanHTML(content).substring(0, 200) + '...'
        });
      }
    }
  }
  
  return articles;
}

// Extract RSS/Atom feed links from HTML
function extractFeedLinks(html: string, baseUrl: string): string[] {
  const feedLinks: string[] = [];
  
  // Look for link tags with RSS/Atom rel attributes
  const linkRegex = /<link[^>]*rel=["'](?:alternate|feed|rss|atom)["'][^>]*href=["']([^"']*?)["'][^>]*>/gi;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href) {
      feedLinks.push(resolveURL(href, baseUrl));
    }
  }
  
  // Common feed paths
  const domain = new URL(baseUrl).origin;
  const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/feeds/all.atom.xml'];
  
  for (const path of commonPaths) {
    feedLinks.push(domain + path);
  }
  
  return [...new Set(feedLinks)]; // Remove duplicates
}

// Extract basic content as last resort
function extractBasicContent(html: string, baseUrl: string): any[] {
  // Very basic content extraction
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? cleanHTML(titleMatch[1]) : 'Untitled';
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["'][^>]*>/i);
  const description = descMatch ? cleanHTML(descMatch[1]) : '';
  
  if (title && description && title !== 'Untitled') {
    return [{
      title: title.trim(),
      body: description.trim(),
      source_url: baseUrl,
      published_at: new Date().toISOString(),
      author: null,
      summary: description.substring(0, 200) + '...'
    }];
  }
  
  return [];
}

// Store articles in database
async function storeArticles(articles: any[], sourceId: string, region: string, supabase: any): Promise<number> {
  let storedCount = 0;
  
  for (const article of articles) {
    try {
      // Check for duplicates by URL
      const { data: existing } = await supabase
        .from('articles')
        .select('id')
        .eq('source_url', article.source_url)
        .maybeSingle();

      if (existing) {
        console.log(`⏭️ Skipping duplicate: ${article.title}`);
        continue;
      }

      // Insert new article
      const { error } = await supabase
        .from('articles')
        .insert({
          ...article,
          source_id: sourceId,
          region: region,
          processing_status: 'new'
        });

      if (error) {
        console.error(`❌ Failed to store: ${article.title} - ${error.message}`);
      } else {
        storedCount++;
        console.log(`💾 Stored: ${article.title}`);
      }

    } catch (error) {
      console.error(`❌ Error storing article: ${error.message}`);
    }
  }
  
  return storedCount;
}

// Update source metrics
async function updateSourceMetrics(sourceId: string, success: boolean, method: string, responseTime: number, supabase: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('content_sources')
      .update({
        last_scraped_at: new Date().toISOString(),
        avg_response_time_ms: responseTime,
        scraping_method: method,
        success_rate: success ? 100 : 0 // Simplified for now
      })
      .eq('id', sourceId);

    if (error) {
      console.error('Failed to update source metrics:', error);
    }
  } catch (error) {
    console.error('Error updating source metrics:', error);
  }
}

// Utility functions
function extractXMLContent(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractLinkHref(content: string): string | null {
  const match = content.match(/<link[^>]*href=["']([^"']*?)["'][^>]*>/i);
  return match ? match[1] : null;
}

function extractAuthorName(content: string): string | null {
  const nameMatch = content.match(/<name>([^<]*)<\/name>/i);
  return nameMatch ? nameMatch[1] : null;
}

function extractFromHTML(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) {
      return matches[1] || matches[0];
    }
  }
  return '';
}

function cleanHTML(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(dateString: string | null): string | null {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    return date.toISOString();
  } catch {
    return null;
  }
}

function resolveURL(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}