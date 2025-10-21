import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
      errors: [error instanceof Error ? error.message : String(error)],
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
  let bestRssResult: { articles: DiscoveredUrl[]; contentQuality: number; feedUrl: string } = { articles: [], contentQuality: 0, feedUrl: '' };
  
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
      const feedArticles: DiscoveredUrl[] = [];
      let totalContentLength = 0;
      let itemsWithContent = 0;
      
      // Parse RSS items
      const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      let match;
      
      while ((match = itemPattern.exec(xml)) !== null && feedArticles.length < maxUrls) {
        const itemContent = match[1];
        
        // Extract required fields with better content detection
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
                         /<dc:date[^>]*>(.*?)<\/dc:date>/i.exec(itemContent) ||
                         /<published[^>]*>(.*?)<\/published>/i.exec(itemContent);
        
        if (linkMatch && titleMatch) {
          let content = '';
          let contentLength = 0;
          
          if (contentMatch) {
            // Clean content and measure length
            content = contentMatch[1]
              .replace(/<!\[CDATA\[|\]\]>/g, '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            contentLength = content.length;
            totalContentLength += contentLength;
            
            // Check if this looks like full content vs snippet
            if (contentLength > 500) {
              itemsWithContent++;
            }
          }
          
          // Parse and validate date
          const parsedDate = parseRssDate(dateMatch ? dateMatch[1].trim() : '');
          
          feedArticles.push({
            url: linkMatch[1].trim(),
            title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
            excerpt: content.length > 200 ? content.substring(0, 200) + '...' : content,
            publishedAt: parsedDate
          });
        }
      }
      
      // Calculate content quality score for this RSS feed
      const avgContentLength = feedArticles.length > 0 ? totalContentLength / feedArticles.length : 0;
      const fullContentRatio = feedArticles.length > 0 ? itemsWithContent / feedArticles.length : 0;
      
      // Quality scoring: prioritize feeds with full content
      let qualityScore = 0;
      if (avgContentLength > 500) qualityScore += 50; // Full articles
      else if (avgContentLength > 200) qualityScore += 25; // Reasonable excerpts
      else if (avgContentLength > 100) qualityScore += 10; // Short excerpts
      
      qualityScore += fullContentRatio * 30; // Bonus for high full content ratio
      qualityScore += Math.min(20, feedArticles.length * 2); // Bonus for more articles
      
      console.log(`📊 RSS feed quality: ${rssUrl}`);
      console.log(`   - Articles: ${feedArticles.length}, Avg content: ${avgContentLength.toFixed(0)} chars`);
      console.log(`   - Full content ratio: ${(fullContentRatio * 100).toFixed(1)}%, Quality score: ${qualityScore.toFixed(1)}`);
      
      // Keep track of the best RSS feed
      if (qualityScore > bestRssResult.contentQuality && feedArticles.length > 0) {
        bestRssResult = {
          articles: feedArticles,
          contentQuality: qualityScore,
          feedUrl: rssUrl
        };
      }
      
    } catch (error) {
      console.error(`Error parsing RSS feed ${rssUrl}:`, error);
    }
  }
  
  // Return the best RSS feed if it meets quality threshold
  if (bestRssResult.contentQuality >= 30) { // Minimum threshold for accepting RSS
    console.log(`✅ RSS parsing successful: ${bestRssResult.articles.length} articles from ${bestRssResult.feedUrl}`);
    console.log(`   🎯 Selected for quality score: ${bestRssResult.contentQuality.toFixed(1)}`);
    return bestRssResult.articles;
  } else if (bestRssResult.articles.length > 0) {
    console.log(`⚠️ RSS content quality too low (${bestRssResult.contentQuality.toFixed(1)}), will fallback to HTML`);
  }
  
  return [];
}

/**
 * Parse RSS date with multiple format support and error handling
 */
function parseRssDate(dateString: string): string | undefined {
  if (!dateString || dateString.trim() === '') {
    return undefined;
  }
  
  // Clean up the date string
  let cleanDate = dateString.trim();
  
  // Handle common invalid dates
  if (['Daily', 'Weekly', 'Monthly', 'N/A', 'TBD'].includes(cleanDate)) {
    console.log(`⚠️ Invalid date found: "${cleanDate}", skipping`);
    return undefined;
  }
  
  try {
    // Try parsing as standard date formats
    const date = new Date(cleanDate);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.log(`⚠️ Could not parse date: "${cleanDate}"`);
      return undefined;
    }
    
    // Check if date is reasonable (not too far in future/past)
    const now = new Date();
    const yearsDiff = Math.abs(now.getFullYear() - date.getFullYear());
    
    if (yearsDiff > 10) {
      console.log(`⚠️ Date seems unrealistic: "${cleanDate}" (${yearsDiff} years from now)`);
      return undefined;
    }
    
    return date.toISOString();
    
  } catch (error) {
    console.log(`⚠️ Date parsing error for "${cleanDate}": ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}