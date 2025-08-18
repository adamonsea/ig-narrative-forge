import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author?: string;
  category?: string;
  guid?: string;
}

interface ScrapedArticle {
  title: string;
  headline: string;
  subheading?: string;
  author?: string;
  publishedDate?: string;
  fullText: string;
  summary: string;
  sourceUrl: string;
}

interface ScrapeResult {
  success: boolean;
  articlesScraped: number;
  duplicatesFound: number;
  errors: string[];
  sourceId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region = 'general' } = await req.json();
    
    console.log(`Starting RSS scrape for: ${feedUrl}`);
    const startTime = Date.now();
    
    // Normalize and validate URL
    const normalizedUrl = normalizeUrl(feedUrl);
    
    // Fetch RSS feed
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'NewsSlides-Bot/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rssText = await response.text();
    const items = parseRSSFeed(rssText);
    
    let articlesScraped = 0;
    let duplicatesFound = 0;
    const errors: string[] = [];

    // Process each RSS item
    for (const item of items) {
      try {
        // Check for existing article by URL first (faster check)
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('source_url', item.link)
          .single();

        if (existing) {
          duplicatesFound++;
          continue;
        }

        console.log(`Scraping full article from: ${item.link}`);
        
        // Scrape the full article content
        const scrapedArticle = await scrapeFullArticle(item.link, {
          title: item.title,
          description: item.description,
          author: item.author,
          pubDate: item.pubDate
        });
        
        if (!scrapedArticle.fullText || scrapedArticle.fullText.length < 100) {
          errors.push(`Article too short or failed to scrape: ${item.link}`);
          continue;
        }

        // Check if article is relevant to Eastbourne
        const isEastbourneRelevant = checkEastbourneRelevance(scrapedArticle, item);
        if (!isEastbourneRelevant) {
          console.log(`Skipping article - no Eastbourne relevance: ${scrapedArticle.title}`);
          continue;
        }

        const contentChecksum = await generateChecksum(scrapedArticle.fullText + scrapedArticle.title);

        // Insert new article with full content
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            title: scrapedArticle.headline?.substring(0, 500) || scrapedArticle.title?.substring(0, 500) || 'Untitled',
            body: scrapedArticle.fullText,
            summary: scrapedArticle.summary || scrapedArticle.subheading || item.description?.substring(0, 500) || '',
            author: scrapedArticle.author || item.author,
            source_url: item.link,
            canonical_url: normalizeUrl(item.link),
            published_at: scrapedArticle.publishedDate ? parseDate(scrapedArticle.publishedDate) : parseDate(item.pubDate),
            region,
            source_id: sourceId,
            content_checksum: contentChecksum,
            category: item.category,
            import_metadata: {
              imported_from: 'rss_full_scrape',
              feed_url: feedUrl,
              guid: item.guid,
              scraped_at: new Date().toISOString(),
              subheading: scrapedArticle.subheading,
              original_rss_description: item.description
            }
          });

        if (insertError) {
          errors.push(`Failed to insert article: ${insertError.message}`);
          console.error('Insert error:', insertError);
        } else {
          articlesScraped++;
          console.log(`Successfully scraped and saved: ${scrapedArticle.title}`);
        }
        
        // Add small delay to be respectful to servers
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errors.push(`Error processing item ${item.link}: ${error.message}`);
        console.error(`Error processing ${item.link}:`, error);
      }
    }

    // Update source statistics
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await updateSourceStats(supabase, sourceId, articlesScraped, responseTime, errors.length === 0);
    }

    const result: ScrapeResult = {
      success: true,
      articlesScraped,
      duplicatesFound,
      errors,
      sourceId
    };

    console.log(`RSS scrape completed: ${JSON.stringify(result)}`);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('RSS scraper error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesScraped: 0,
        duplicatesFound: 0,
        errors: [error.message]
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove UTM parameters and tracking
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    paramsToRemove.forEach(param => parsed.searchParams.delete(param));
    
    // Normalize domain
    parsed.hostname = parsed.hostname.toLowerCase();
    
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseRSSFeed(rssText: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Basic RSS parsing - extract items between <item> tags
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];
    
    const item: RSSItem = {
      title: extractTag(itemContent, 'title') || 'Untitled',
      link: extractTag(itemContent, 'link') || '',
      description: extractTag(itemContent, 'description') || '',
      pubDate: extractTag(itemContent, 'pubDate') || new Date().toISOString(),
      author: extractTag(itemContent, 'author') || extractTag(itemContent, 'dc:creator'),
      category: extractTag(itemContent, 'category'),
      guid: extractTag(itemContent, 'guid')
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

function parseDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function generateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkEastbourneRelevance(article: ScrapedArticle, rssItem: RSSItem): boolean {
  const searchTerm = 'eastbourne';
  
  // Check in tags/categories
  if (rssItem.category && rssItem.category.toLowerCase().includes(searchTerm)) {
    return true;
  }
  
  // Check in article content (title, headline, full text)
  const contentToCheck = [
    article.title,
    article.headline, 
    article.subheading,
    article.fullText,
    article.summary,
    rssItem.description
  ].filter(Boolean).join(' ').toLowerCase();
  
  if (contentToCheck.includes(searchTerm)) {
    return true;
  }
  
  return false;
}

async function scrapeFullArticle(url: string, rssData: any): Promise<ScrapedArticle> {
  try {
    console.log(`Fetching full article content from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) {
      throw new Error('Failed to parse HTML');
    }

    // Extract structured article content
    const article = extractArticleContent(doc, url);
    
    return {
      title: rssData.title,
      headline: article.headline || rssData.title,
      subheading: article.subheading,
      author: article.author || rssData.author,
      publishedDate: article.publishedDate || rssData.pubDate,
      fullText: article.fullText,
      summary: article.summary || rssData.description,
      sourceUrl: url
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    // Fallback to RSS data if scraping fails
    return {
      title: rssData.title,
      headline: rssData.title,
      author: rssData.author,
      publishedDate: rssData.pubDate,
      fullText: rssData.description || '',
      summary: rssData.description || '',
      sourceUrl: url
    };
  }
}

function extractArticleContent(doc: any, url: string) {
  // Common selectors for article content
  const contentSelectors = [
    'article',
    '[role="main"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content',
    '.story-body',
    '.article-body',
    '#article-body',
    '.field-name-body',
    '.field-type-text-with-summary'
  ];

  const titleSelectors = [
    'h1',
    '.headline',
    '.article-title',
    '.entry-title',
    '.post-title',
    '[property="headline"]',
    '.title'
  ];

  const authorSelectors = [
    '[rel="author"]',
    '.author',
    '.byline',
    '.article-author',
    '[property="author"]',
    '.writer',
    '.by-author'
  ];

  const dateSelectors = [
    'time[datetime]',
    '.published',
    '.date',
    '.article-date',
    '[property="datePublished"]',
    '.post-date'
  ];

  // Extract headline
  let headline = '';
  for (const selector of titleSelectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      headline = element.textContent.trim();
      break;
    }
  }

  // Extract author
  let author = '';
  for (const selector of authorSelectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      author = element.textContent.trim().replace(/^(By|Author:)\s*/i, '');
      break;
    }
  }

  // Extract published date
  let publishedDate = '';
  for (const selector of dateSelectors) {
    const element = doc.querySelector(selector);
    if (element) {
      publishedDate = element.getAttribute('datetime') || element.textContent?.trim() || '';
      if (publishedDate) break;
    }
  }

  // Extract main content
  let fullText = '';
  let contentElement = null;

  // Try to find the main article content
  for (const selector of contentSelectors) {
    contentElement = doc.querySelector(selector);
    if (contentElement) {
      break;
    }
  }

  // If no specific article container found, try to find multiple paragraphs
  if (!contentElement || !contentElement.textContent?.trim()) {
    const paragraphs = doc.querySelectorAll('p');
    if (paragraphs && paragraphs.length > 3) {
      fullText = Array.from(paragraphs)
        .map((p: any) => p.textContent?.trim())
        .filter((text: string) => text && text.length > 20)
        .join('\n\n');
    }
  } else {
    // Clean up the content
    // Remove script and style tags
    contentElement.querySelectorAll('script, style, nav, aside, .advertisement, .ad, .social-share')
      .forEach((el: any) => el.remove());
    
    fullText = contentElement.textContent?.trim() || '';
  }

  // Extract subheading (usually the first paragraph or subtitle)
  let subheading = '';
  const subheadingSelectors = ['.standfirst', '.subtitle', '.subhead', '.deck', '.summary'];
  for (const selector of subheadingSelectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      subheading = element.textContent.trim();
      break;
    }
  }

  // If no subheading found, try first paragraph
  if (!subheading && fullText) {
    const firstParagraph = fullText.split('\n\n')[0];
    if (firstParagraph && firstParagraph.length < 300) {
      subheading = firstParagraph;
    }
  }

  // Clean up text
  fullText = fullText
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return {
    headline,
    subheading,
    author,
    publishedDate,
    fullText,
    summary: subheading || fullText.substring(0, 200) + '...'
  };
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