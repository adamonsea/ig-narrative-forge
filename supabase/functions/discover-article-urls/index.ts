import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiscoveredUrl {
  url: string;
  title?: string;
  excerpt?: string;
  publishedAt?: string;
  author?: string;
  imageUrl?: string;
}

interface DiscoveryResult {
  success: boolean;
  discoveredUrls: DiscoveredUrl[];
  totalFound: number;
  method: string;
  errors: string[];
  indexUrl: string;
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

    const { indexUrl, sourceId, maxUrls = 20 } = await req.json();

    if (!indexUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: indexUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 URL Discovery started for: ${indexUrl}`);

    const result: DiscoveryResult = {
      success: false,
      discoveredUrls: [],
      totalFound: 0,
      method: 'html-parser',
      errors: [],
      indexUrl
    };

    // Log the start of URL discovery
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'URL discovery started',
      context: { indexUrl, sourceId, maxUrls },
      function_name: 'discover-article-urls'
    });

    // Fetch the index page
    const response = await fetch(indexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(30000) // 30 second timeout for large pages
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 Index page fetched: ${html.length} characters`);

    // First, try to discover RSS feeds
    const rssFeeds = await discoverRssFeeds(html, indexUrl);
    if (rssFeeds.length > 0) {
      console.log(`📡 Found ${rssFeeds.length} RSS feeds, trying RSS first...`);
      
      const rssUrls = await parseRssFeeds(rssFeeds, maxUrls);
      if (rssUrls.length > 0) {
        result.discoveredUrls = rssUrls;
        result.totalFound = rssUrls.length;
        result.success = true;
        result.method = 'rss-parser';
        
        console.log(`✅ RSS discovery successful: ${result.totalFound} URLs from RSS feeds`);
        
        // Log completion and return early
        await supabase.from('system_logs').insert({
          level: 'info',
          message: `RSS discovery completed: ${result.totalFound} URLs found`,
          context: { indexUrl, sourceId, urlsFound: result.totalFound, method: 'rss' },
          function_name: 'discover-article-urls'
        });

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Parse HTML to find article URLs (with length limit for CPU efficiency)
    const limitedHtml = html.length > 100000 ? html.substring(0, 100000) : html;
    const discoveredUrls = await parseArticleLinks(limitedHtml, indexUrl, maxUrls);
    
    result.discoveredUrls = discoveredUrls;
    result.totalFound = discoveredUrls.length;
    result.success = discoveredUrls.length > 0;

    if (result.success) {
      console.log(`✅ Discovery successful: ${result.totalFound} URLs found`);
      
      // Log discovered URLs
      for (const url of discoveredUrls.slice(0, 5)) { // Log first 5
        console.log(`  📝 ${url.title || 'Untitled'}: ${url.url}`);
      }
    } else {
      result.errors.push('No article URLs discovered');
      console.log(`❌ No URLs discovered from: ${indexUrl}`);
    }

    // Log completion
    await supabase.from('system_logs').insert({
      level: result.success ? 'info' : 'warn',
      message: `URL discovery completed: ${result.totalFound} URLs found`,
      context: { 
        indexUrl, 
        sourceId, 
        urlsFound: result.totalFound,
        success: result.success,
        errors: result.errors
      },
      function_name: 'discover-article-urls'
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ URL Discovery error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      discoveredUrls: [],
      totalFound: 0,
      method: 'html-parser',
      errors: [error.message],
      indexUrl: ''
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function parseArticleLinks(html: string, baseUrl: string, maxUrls: number): Promise<DiscoveredUrl[]> {
  const discoveredUrls: DiscoveredUrl[] = [];
  const seenUrls = new Set<string>();
  
  try {
    const urlObject = new URL(baseUrl);
    const domain = urlObject.origin;
    
    // CPU-optimized parsing: process HTML in chunks to avoid timeouts
    const chunkSize = 50000; // Process 50KB chunks
    let processedLength = 0;
    
    while (processedLength < html.length && discoveredUrls.length < maxUrls) {
      const chunk = html.substring(processedLength, processedLength + chunkSize);
      processedLength += chunkSize;
      
      // Enhanced regex patterns for finding article links
      const linkPatterns = [
        // Standard HTML links
        /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi,
        // Links with titles
        /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*title\s*=\s*["']([^"']+)["'][^>]*>/gi,
        // Article-specific patterns
        /<article[^>]*>[\s\S]*?<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi
      ];

      for (const pattern of linkPatterns) {
        let match;
        let iterations = 0;
        const maxIterations = 1000; // Prevent infinite loops
        
        while ((match = pattern.exec(chunk)) !== null && discoveredUrls.length < maxUrls && iterations < maxIterations) {
          iterations++;
          let href = match[1];
          const linkText = match[2] ? match[2].replace(/<[^>]*>/g, '').trim() : '';
          
          // Convert relative URLs to absolute
          if (href.startsWith('/')) {
            href = domain + href;
          } else if (href.startsWith('./')) {
            href = domain + href.substring(1);
          } else if (!href.startsWith('http')) {
            continue; // Skip invalid URLs
          }

          // Filter for likely article URLs
          if (isLikelyArticleUrl(href, baseUrl) && !seenUrls.has(href)) {
            seenUrls.add(href);
            
            // Extract additional metadata from surrounding HTML (limited processing)
            const metadata = extractMetadataFromContext(chunk, href, linkText);
            
            discoveredUrls.push({
              url: href,
              title: metadata.title || linkText || undefined,
              excerpt: metadata.excerpt,
              publishedAt: metadata.publishedAt,
              author: metadata.author,
              imageUrl: metadata.imageUrl
            });
          }
        }
      }
      
      // Break if we've found enough URLs
      if (discoveredUrls.length >= maxUrls) {
        break;
      }
    }

    // If no URLs found with standard patterns, try broader search (limited)
    if (discoveredUrls.length === 0) {
      console.log('🔍 No URLs found with standard patterns, trying broader search...');
      
      // Look for any links that contain article-like paths (limited search)
      const broadPattern = /<a[^>]+href\s*=\s*["']([^"']+(?:article|post|news|blog|story)[^"']*)["'][^>]*>/gi;
      const limitedHtml = html.substring(0, 20000); // Only check first 20KB for broad search
      let match;
      let iterations = 0;
      const maxIterations = 500;
      
      while ((match = broadPattern.exec(limitedHtml)) !== null && discoveredUrls.length < maxUrls && iterations < maxIterations) {
        iterations++;
        let href = match[1];
        
        if (href.startsWith('/')) {
          href = domain + href;
        }
        
        if (!seenUrls.has(href)) {
          seenUrls.add(href);
          discoveredUrls.push({ url: href });
        }
      }
    }

    console.log(`🔗 Parsed ${discoveredUrls.length} potential article URLs`);
    return discoveredUrls.slice(0, maxUrls);
    
  } catch (error) {
    console.error('Error parsing article links:', error);
    return [];
  }
}

function isLikelyArticleUrl(url: string, baseUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    const baseUrlObj = new URL(baseUrl);
    
    // Must be from same domain
    if (urlObj.hostname !== baseUrlObj.hostname) {
      return false;
    }
    
    const pathname = urlObj.pathname.toLowerCase();
    
    // Skip common non-article paths
    const skipPatterns = [
      /\/(category|tag|author|archive|about|contact|privacy|terms)/,
      /\.(css|js|png|jpg|jpeg|gif|pdf|xml|json)$/,
      /#/, // Skip anchors
      /\/page\/\d+/, // Skip pagination
      /\/(login|register|search|sitemap)/,
      /\/wp-admin/, // Skip WordPress admin
      /\/feed/, // Skip RSS feeds
    ];
    
    for (const pattern of skipPatterns) {
      if (pattern.test(pathname)) {
        return false;
      }
    }
    
    // Positive indicators for article URLs
    const articleIndicators = [
      /\/\d{4}\/\d{2}\//, // Date-based URLs (2024/01/)
      /\/article\//, 
      /\/post\//, 
      /\/news\//, 
      /\/blog\//, 
      /\/story\//,
      /\/[^\/]+\/$/, // Single slug ending with /
      /\/[^\/]+\.html$/, // HTML files
      /\/\d+\//, // Numeric IDs
      /\/[a-z0-9-]{10,}/, // Long slugs
    ];
    
    for (const pattern of articleIndicators) {
      if (pattern.test(pathname)) {
        return true;
      }
    }
    
    // If no clear indicators, check for reasonable slug length
    const slug = pathname.split('/').filter(p => p).pop() || '';
    return slug.length > 5 && slug.length < 100 && /^[a-z0-9-]+$/.test(slug);
    
  } catch (error) {
    return false;
  }
}

function extractMetadataFromContext(html: string, url: string, linkText: string): Partial<DiscoveredUrl> {
  const metadata: Partial<DiscoveredUrl> = {};
  
  try {
    // CPU-optimized: only search in a limited context around the URL
    const urlIndex = html.indexOf(url);
    if (urlIndex === -1) {
      // Fallback: use linkText as title if available
      if (linkText && linkText.length > 5) {
        metadata.title = linkText.replace(/^\s*Read more\s*/i, '').trim();
      }
      return metadata;
    }
    
    // Extract limited context (500 chars before and after)
    const contextStart = Math.max(0, urlIndex - 500);
    const contextEnd = Math.min(html.length, urlIndex + 500);
    const fullContext = html.substring(contextStart, contextEnd);
    
    // Extract title from context (optimized)
    const titlePatterns = [
      /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i,
      /title\s*=\s*["']([^"']+)["']/i,
      /<[^>]*class\s*=\s*["'][^"']*title[^"']*["'][^>]*>([^<]+)</i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = pattern.exec(fullContext);
      if (match && match[1] && match[1].trim().length > linkText.length) {
        metadata.title = match[1].trim();
        break;
      }
    }
    
    // Extract date (limited patterns)
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
    ];
    
    for (const pattern of datePatterns) {
      const match = pattern.exec(fullContext);
      if (match) {
        metadata.publishedAt = match[1];
        break;
      }
    }
    
    // If no title from context, use cleaned link text
    if (!metadata.title && linkText && linkText.length > 5) {
      metadata.title = linkText.replace(/^\s*Read more\s*/i, '').trim();
    }
    
  } catch (error) {
    console.error('Error extracting metadata:', error);
    // Fallback to linkText
    if (linkText && linkText.length > 5) {
      metadata.title = linkText;
    }
  }
  
  return metadata;
}

async function discoverRssFeeds(html: string, baseUrl: string): Promise<string[]> {
  const rssUrls: string[] = [];
  const domain = new URL(baseUrl).origin;
  
  try {
    // Look for RSS feed links in HTML
    const rssPatterns = [
      /<link[^>]+type\s*=\s*["']application\/rss\+xml["'][^>]+href\s*=\s*["']([^"']+)["']/gi,
      /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+type\s*=\s*["']application\/rss\+xml["']/gi,
      /<a[^>]+href\s*=\s*["']([^"']*rss[^"']*)["']/gi,
      /<a[^>]+href\s*=\s*["']([^"']*feed[^"']*)["']/gi
    ];
    
    for (const pattern of rssPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && rssUrls.length < 5) {
        let feedUrl = match[1];
        
        if (feedUrl.startsWith('/')) {
          feedUrl = domain + feedUrl;
        }
        
        if (feedUrl.includes('rss') || feedUrl.includes('feed')) {
          rssUrls.push(feedUrl);
        }
      }
    }
    
    // Common RSS paths to try
    const commonRssPaths = ['/rss', '/feed', '/rss.xml', '/feed.xml', '/feeds/all.rss'];
    for (const path of commonRssPaths) {
      const rssUrl = domain + path;
      if (!rssUrls.includes(rssUrl)) {
        rssUrls.push(rssUrl);
      }
    }
    
  } catch (error) {
    console.error('Error discovering RSS feeds:', error);
  }
  
  return rssUrls.slice(0, 3); // Limit to 3 RSS feeds
}

async function parseRssFeeds(rssUrls: string[], maxUrls: number): Promise<DiscoveredUrl[]> {
  const articles: DiscoveredUrl[] = [];
  
  for (const rssUrl of rssUrls) {
    try {
      console.log(`📡 Fetching RSS feed: ${rssUrl}`);
      
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) continue;
      
      const xml = await response.text();
      
      // Parse RSS items
      const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      let match;
      
      while ((match = itemPattern.exec(xml)) !== null && articles.length < maxUrls) {
        const itemContent = match[1];
        
        // Extract required fields
        const linkMatch = /<link[^>]*>(.*?)<\/link>/i.exec(itemContent) || 
                         /<link[^>]*><!\[CDATA\[(.*?)\]\]><\/link>/i.exec(itemContent);
        const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(itemContent) || 
                          /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(itemContent);
        const descMatch = /<description[^>]*>(.*?)<\/description>/i.exec(itemContent) || 
                         /<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/i.exec(itemContent);
        const dateMatch = /<pubDate[^>]*>(.*?)<\/pubDate>/i.exec(itemContent);
        
        if (linkMatch && titleMatch) {
          articles.push({
            url: linkMatch[1].trim(),
            title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
            excerpt: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>|<[^>]*>/g, '').trim().substring(0, 200) : undefined,
            publishedAt: dateMatch ? dateMatch[1].trim() : undefined
          });
        }
      }
      
      if (articles.length > 0) {
        console.log(`✅ RSS parsing successful: ${articles.length} articles from ${rssUrl}`);
        break; // Use first successful RSS feed
      }
      
    } catch (error) {
      console.error(`Error parsing RSS feed ${rssUrl}:`, error);
    }
  }
  
  return articles;
}