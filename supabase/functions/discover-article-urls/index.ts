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
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 Index page fetched: ${html.length} characters`);

    // Parse HTML to find article URLs
    const discoveredUrls = await parseArticleLinks(html, indexUrl, maxUrls);
    
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
      while ((match = pattern.exec(html)) !== null && discoveredUrls.length < maxUrls) {
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
          
          // Extract additional metadata from surrounding HTML
          const metadata = extractMetadataFromContext(html, href, linkText);
          
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

    // If no URLs found with standard patterns, try broader search
    if (discoveredUrls.length === 0) {
      console.log('🔍 No URLs found with standard patterns, trying broader search...');
      
      // Look for any links that contain article-like paths
      const broadPattern = /<a[^>]+href\s*=\s*["']([^"']+(?:article|post|news|blog|story)[^"']*)["'][^>]*>/gi;
      let match;
      while ((match = broadPattern.exec(html)) !== null && discoveredUrls.length < maxUrls) {
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
    // Try to find the link in context and extract surrounding metadata
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const contextPattern = new RegExp(`([\\s\\S]{0,500})href\\s*=\\s*["']${escapedUrl}["']([\\s\\S]{0,500})`, 'i');
    const contextMatch = contextPattern.exec(html);
    
    if (contextMatch) {
      const beforeContext = contextMatch[1];
      const afterContext = contextMatch[2];
      const fullContext = beforeContext + afterContext;
      
      // Extract title from context
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
      
      // Extract date
      const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
      ];
      
      for (const pattern of datePatterns) {
        const match = pattern.exec(fullContext);
        if (match) {
          metadata.publishedAt = match[1];
          break;
        }
      }
      
      // Extract excerpt
      const excerptPattern = /<p[^>]*>([^<]{50,200})<\/p>/i;
      const excerptMatch = excerptPattern.exec(fullContext);
      if (excerptMatch) {
        metadata.excerpt = excerptMatch[1].trim().substring(0, 150);
      }
    }
    
    // If no title from context, use cleaned link text
    if (!metadata.title && linkText && linkText.length > 5) {
      metadata.title = linkText.replace(/^\s*Read more\s*/i, '').trim();
    }
    
  } catch (error) {
    console.error('Error extracting metadata:', error);
  }
  
  return metadata;
}