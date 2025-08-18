import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
        const contentChecksum = await generateChecksum(item.title + item.description + item.link);
        
        // Check for existing article with same checksum
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('content_checksum', contentChecksum)
          .single();

        if (existing) {
          duplicatesFound++;
          continue;
        }

        // Insert new article
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            title: item.title?.substring(0, 500) || 'Untitled',
            body: item.description || '',
            author: item.author,
            source_url: item.link,
            canonical_url: normalizeUrl(item.link),
            published_at: parseDate(item.pubDate),
            region,
            source_id: sourceId,
            content_checksum: contentChecksum,
            category: item.category,
            import_metadata: {
              imported_from: 'rss',
              feed_url: feedUrl,
              guid: item.guid,
              scraped_at: new Date().toISOString()
            }
          });

        if (insertError) {
          errors.push(`Failed to insert article: ${insertError.message}`);
        } else {
          articlesScraped++;
        }
      } catch (error) {
        errors.push(`Error processing item: ${error.message}`);
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