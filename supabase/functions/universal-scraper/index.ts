import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapedArticle {
  title: string;
  content: string;
  author?: string;
  publishedDate?: string;
  summary?: string;
  url: string;
  imageUrl?: string;
}

interface ScrapeResult {
  success: boolean;
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: 'rss' | 'web_scraping' | 'hybrid';
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
    
    console.log(`Starting universal scrape for: ${feedUrl}`);
    const startTime = Date.now();
    
    let articles: ScrapedArticle[] = [];
    let scrapeMethod: 'rss' | 'web_scraping' | 'hybrid' = 'web_scraping';
    
    // Try RSS first if the URL looks like an RSS feed
    if (isRSSUrl(feedUrl)) {
      console.log('Attempting RSS scraping...');
      try {
        articles = await scrapeRSSFeed(feedUrl);
        scrapeMethod = 'rss';
        console.log(`RSS scraping successful: ${articles.length} articles found`);
      } catch (error) {
        console.log(`RSS failed: ${error.message}, falling back to web scraping`);
        articles = await scrapeWebsite(feedUrl);
        scrapeMethod = 'hybrid';
      }
    } else {
      // Direct web scraping for non-RSS URLs
      console.log('Performing intelligent web scraping...');
      articles = await scrapeWebsite(feedUrl);
    }

    let articlesScraped = 0;
    const errors: string[] = [];

    // Process and save articles
    for (const article of articles) {
      try {
        // Check for existing article
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('source_url', article.url)
          .single();

        if (existing) {
          continue; // Skip duplicates
        }

        // Eastbourne relevance check
        if (!checkEastbourneRelevance(article)) {
          console.log(`Skipping non-Eastbourne article: ${article.title}`);
          continue;
        }

        const relevanceScore = calculateRelevanceScore(article);
        const contentChecksum = await generateChecksum(article.content + article.title);

        // Insert article
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            title: article.title.substring(0, 500),
            body: article.content,
            summary: article.summary?.substring(0, 500) || '',
            author: article.author,
            source_url: article.url,
            canonical_url: normalizeUrl(article.url),
            published_at: article.publishedDate || new Date().toISOString(),
            region,
            source_id: sourceId,
            content_checksum: contentChecksum,
            word_count: article.content.split(/\s+/).length,
            reading_time_minutes: Math.ceil(article.content.split(/\s+/).length / 200),
            image_url: article.imageUrl,
            import_metadata: {
              imported_from: 'universal_scraper',
              scrape_method: scrapeMethod,
              scraped_at: new Date().toISOString(),
              eastbourne_relevance_score: relevanceScore
            }
          });

        if (insertError) {
          errors.push(`Failed to insert article "${article.title}": ${insertError.message}`);
        } else {
          articlesScraped++;
          console.log(`Saved: ${article.title} (Relevance: ${relevanceScore})`);
        }

      } catch (error) {
        errors.push(`Error processing article "${article.title}": ${error.message}`);
      }
    }

    // Update source stats
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await updateSourceStats(supabase, sourceId, articlesScraped, responseTime, errors.length === 0);
    }

    const result: ScrapeResult = {
      success: true,
      articlesFound: articles.length,
      articlesScraped,
      errors,
      method: scrapeMethod
    };

    console.log(`Universal scrape completed: ${JSON.stringify(result)}`);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Universal scraper error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'unknown'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function isRSSUrl(url: string): boolean {
  const rssIndicators = [
    '/rss', '/feed', 'rss.xml', 'feed.xml', 'atom.xml',
    '?service=rss', 'feeds.', '/api/rss', '/rss/'
  ];
  return rssIndicators.some(indicator => url.toLowerCase().includes(indicator));
}

async function scrapeRSSFeed(url: string): Promise<ScrapedArticle[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NewsSlides-Bot/1.0',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const rssText = await response.text();
  const items = parseRSSFeed(rssText);
  
  const articles: ScrapedArticle[] = [];
  
  for (const item of items.slice(0, 10)) { // Limit to 10 most recent
    try {
      const fullArticle = await scrapeFullArticle(item.link);
      if (fullArticle.content.length > 100) {
        articles.push({
          title: item.title,
          content: fullArticle.content,
          author: fullArticle.author || item.author,
          publishedDate: item.pubDate,
          summary: fullArticle.summary || item.description,
          url: item.link,
          imageUrl: fullArticle.imageUrl
        });
      }
    } catch (error) {
      console.error(`Failed to scrape RSS article: ${item.link}`);
    }
  }
  
  return articles;
}

async function scrapeWebsite(url: string): Promise<ScrapedArticle[]> {
  console.log(`Intelligently scraping website: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Website fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }

  // Look for article links on the page
  const articleLinks = extractArticleLinks(doc, url);
  console.log(`Found ${articleLinks.length} potential article links`);
  
  const articles: ScrapedArticle[] = [];
  
  // If we found article links, scrape them
  if (articleLinks.length > 0) {
    for (const link of articleLinks.slice(0, 15)) { // Limit to 15 articles
      try {
        const article = await scrapeFullArticle(link);
        if (article.content.length > 150) {
          articles.push({
            title: article.title,
            content: article.content,
            author: article.author,
            publishedDate: article.publishedDate,
            summary: article.summary,
            url: link,
            imageUrl: article.imageUrl
          });
        }
        
        // Respectful delay
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Failed to scrape article: ${link}`);
      }
    }
  } else {
    // Try to extract content from the current page if it looks like an article
    const pageArticle = extractArticleFromPage(doc, url);
    if (pageArticle.content.length > 150) {
      articles.push(pageArticle);
    }
  }
  
  return articles;
}

function extractArticleLinks(doc: any, baseUrl: string): string[] {
  const links: string[] = [];
  const base = new URL(baseUrl);
  
  // Common selectors for article links
  const linkSelectors = [
    'a[href*="/news/"]',
    'a[href*="/article"]',
    'a[href*="/story"]',
    'a[href*="/post"]',
    'article a',
    '.news-item a',
    '.article-link',
    '.story-link',
    'h1 a', 'h2 a', 'h3 a',
    '.headline a',
    '.title a'
  ];
  
  for (const selector of linkSelectors) {
    const elements = doc.querySelectorAll(selector);
    for (const element of elements) {
      const href = element.getAttribute('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          
          // Filter for news-like URLs
          if (isNewsArticleUrl(absoluteUrl) && absoluteUrl.includes(base.hostname)) {
            links.push(absoluteUrl);
          }
        } catch (error) {
          // Invalid URL, skip
        }
      }
    }
  }
  
  // Remove duplicates and return
  return [...new Set(links)];
}

function isNewsArticleUrl(url: string): boolean {
  const newsPatterns = [
    '/news/', '/article', '/story', '/post/', '/2024/', '/2025/',
    'eastbourne', 'sussex', 'local'
  ];
  
  const excludePatterns = [
    'mailto:', 'javascript:', 'tel:', '#', 'facebook.com', 'twitter.com',
    'instagram.com', 'youtube.com', '/search', '/tag', '/category',
    '/author', '/contact', '/about', '/privacy', '/terms'
  ];
  
  const lowerUrl = url.toLowerCase();
  
  // Must match at least one news pattern
  const hasNewsPattern = newsPatterns.some(pattern => lowerUrl.includes(pattern));
  // Must not match any exclude patterns
  const hasExcludePattern = excludePatterns.some(pattern => lowerUrl.includes(pattern));
  
  return hasNewsPattern && !hasExcludePattern;
}

function extractArticleFromPage(doc: any, url: string): ScrapedArticle {
  const contentSelectors = [
    'article',
    '.article-content', 
    '.post-content',
    '.entry-content',
    '.story-body',
    '.news-content',
    '.main-content',
    '[role="main"]'
  ];

  let content = '';
  let title = '';
  let author = '';
  let publishedDate = '';
  let summary = '';
  let imageUrl = '';

  // Extract title
  const titleElement = doc.querySelector('h1') || doc.querySelector('title');
  title = titleElement?.textContent?.trim() || 'Untitled Article';

  // Extract author
  const authorSelectors = ['.author', '.byline', '[rel="author"]', '.writer'];
  for (const selector of authorSelectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      author = element.textContent.trim().replace(/^(By|Author:)\s*/i, '');
      break;
    }
  }

  // Extract published date
  const dateElement = doc.querySelector('time[datetime]') || doc.querySelector('.date');
  publishedDate = dateElement?.getAttribute('datetime') || dateElement?.textContent?.trim() || '';

  // Extract main image
  const imgElement = doc.querySelector('article img') || doc.querySelector('.featured-image img');
  imageUrl = imgElement?.getAttribute('src') || '';

  // Extract main content
  for (const selector of contentSelectors) {
    const element = doc.querySelector(selector);
    if (element) {
      // Remove unwanted elements
      element.querySelectorAll('script, style, .advertisement, .social-share, nav, aside')
        ?.forEach((el: any) => el.remove());
      
      content = element.textContent?.trim() || '';
      if (content.length > 200) break;
    }
  }

  // Fallback content extraction
  if (content.length < 200) {
    const paragraphs = doc.querySelectorAll('p');
    const paragraphTexts = Array.from(paragraphs)
      .map((p: any) => p.textContent?.trim())
      .filter((text: string) => text && text.length > 30);
    
    if (paragraphTexts.length > 2) {
      content = paragraphTexts.slice(0, 10).join('\n\n');
    }
  }

  // Generate summary
  summary = content.split('.')[0] + '.' || content.substring(0, 200) + '...';

  return {
    title,
    content,
    author,
    publishedDate,
    summary,
    url,
    imageUrl
  };
}

async function scrapeFullArticle(url: string): Promise<{
  title: string;
  content: string;
  author?: string;
  publishedDate?: string;
  summary?: string;
  imageUrl?: string;
}> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  return extractArticleFromPage(doc, url);
}

function parseRSSFeed(rssText: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];
    
    const item = {
      title: extractTag(itemContent, 'title') || 'Untitled',
      link: extractTag(itemContent, 'link') || '',
      description: extractTag(itemContent, 'description') || '',
      pubDate: extractTag(itemContent, 'pubDate') || new Date().toISOString(),
      author: extractTag(itemContent, 'author') || extractTag(itemContent, 'dc:creator'),
      category: extractTag(itemContent, 'category')
    };
    
    if (item.title && item.link) {
      items.push(item);
    }
  }
  
  return items;
}

function extractTag(content: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : undefined;
}

function checkEastbourneRelevance(article: ScrapedArticle): boolean {
  const eastbourneTerms = [
    'eastbourne', 'beachy head', 'eastbourne borough council', 
    'eastbourne pier', 'seafront', 'sussex police eastbourne'
  ];
  
  const searchText = `${article.title} ${article.content} ${article.url}`.toLowerCase();
  return eastbourneTerms.some(term => searchText.includes(term));
}

function calculateRelevanceScore(article: ScrapedArticle): number {
  const searchText = `${article.title} ${article.content}`.toLowerCase();
  let score = 0;
  
  // High relevance terms
  if (searchText.includes('eastbourne council')) score += 15;
  if (searchText.includes('eastbourne residents')) score += 15;
  if (searchText.includes('eastbourne pier')) score += 10;
  if (searchText.includes('beachy head')) score += 10;
  
  // Medium relevance
  if (searchText.includes('eastbourne')) score += 5;
  if (searchText.includes('sussex')) score += 3;
  
  // Title mentions
  if (article.title.toLowerCase().includes('eastbourne')) score += 10;
  
  return score;
}

async function generateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return url;
  }
}

async function updateSourceStats(supabase: any, sourceId: string, articlesCount: number, responseTime: number, success: boolean) {
  const { data: source } = await supabase
    .from('content_sources')
    .select('articles_scraped, success_rate, avg_response_time_ms')
    .eq('id', sourceId)
    .single();

  if (source) {
    const totalScraped = (source.articles_scraped || 0) + articlesCount;
    const currentSuccessRate = source.success_rate || 100;
    const newSuccessRate = success ? Math.min(100, currentSuccessRate + 1) : Math.max(0, currentSuccessRate - 5);
    const avgResponseTime = Math.round(((source.avg_response_time_ms || 0) + responseTime) / 2);

    await supabase
      .from('content_sources')
      .update({
        articles_scraped: totalScraped,
        success_rate: newSuccessRate,
        avg_response_time_ms: avgResponseTime,
        last_scraped_at: new Date().toISOString()
      })
      .eq('id', sourceId);
  }
}