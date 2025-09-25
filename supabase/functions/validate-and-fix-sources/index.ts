import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SourceValidationResult {
  sourceId: string;
  sourceName: string;
  originalUrl: string;
  validatedUrl?: string;
  isValid: boolean;
  feedType?: string;
  errorMessage?: string;
  suggestedFix?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { sourceIds, autoFix } = await req.json().catch(() => ({}));

    console.log('🔧 Starting source validation and fixing...');

    // Get problematic sources
    let query = supabase
      .from('content_sources')
      .select('id, source_name, feed_url, success_rate, canonical_domain, last_scraped_at');

    if (sourceIds?.length > 0) {
      query = query.in('id', sourceIds);
    } else {
      // Find sources with poor success rates or recent failures
      query = query
        .eq('is_active', true)
        .lt('success_rate', 50);
    }

    const { data: sources, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    console.log(`🔍 Validating ${sources?.length || 0} problematic sources...`);

    const validationResults: SourceValidationResult[] = [];
    const fixedSources: any[] = [];

    for (const source of sources || []) {
      console.log(`🔧 Validating: ${source.source_name}`);
      
      const result = await validateAndFixSource(source);
      validationResults.push(result);

      // Auto-fix if requested and we found a valid alternative
      if (autoFix && result.isValid && result.validatedUrl && result.validatedUrl !== source.feed_url) {
        console.log(`✅ Auto-fixing source: ${source.source_name}`);
        
        const { error: updateError } = await supabase
          .from('content_sources')
          .update({
            feed_url: result.validatedUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', source.id);

        if (!updateError) {
          fixedSources.push({
            ...source,
            old_url: source.feed_url,
            new_url: result.validatedUrl
          });

          // Log the fix
          await supabase
            .from('system_logs')
            .insert({
              level: 'info',
              message: `Auto-fixed source URL: ${source.source_name}`,
              context: {
                source_id: source.id,
                old_url: source.feed_url,
                new_url: result.validatedUrl,
                fix_type: result.feedType
              },
              function_name: 'validate-and-fix-sources'
            });
        }
      }
    }

    const validSources = validationResults.filter(r => r.isValid);
    const invalidSources = validationResults.filter(r => !r.isValid);
    const fixableSources = validationResults.filter(r => r.isValid && r.validatedUrl);

    console.log(`📊 Validation complete: ${validSources.length} valid, ${invalidSources.length} invalid, ${fixedSources.length} fixed`);

    return new Response(
      JSON.stringify({
        success: true,
        totalSources: sources?.length || 0,
        validSources: validSources.length,
        invalidSources: invalidSources.length,
        fixedSources: fixedSources.length,
        fixableSources: fixableSources.length - fixedSources.length,
        results: validationResults,
        fixedSourcesList: fixedSources,
        message: `Validation completed: ${validSources.length}/${sources?.length} sources valid, ${fixedSources.length} auto-fixed`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Source validation error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Source validation failed',
        message: 'Source validation encountered an error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function validateAndFixSource(source: any): Promise<SourceValidationResult> {
  const result: SourceValidationResult = {
    sourceId: source.id,
    sourceName: source.source_name,
    originalUrl: source.feed_url,
    isValid: false
  };

  try {
    // First, test the original URL
    const originalTest = await testFeedUrl(source.feed_url);
    
    if (originalTest.isValid) {
      result.isValid = true;
      result.validatedUrl = source.feed_url;
      result.feedType = originalTest.feedType;
      return result;
    }

    console.log(`❌ Original URL failed: ${originalTest.error}`);
    result.errorMessage = originalTest.error;

    // Try to find alternative RSS feeds
    const alternatives = await discoverAlternativeFeeds(source);
    
    for (const altUrl of alternatives) {
      console.log(`🔍 Testing alternative: ${altUrl}`);
      const altTest = await testFeedUrl(altUrl);
      
      if (altTest.isValid) {
        console.log(`✅ Found working alternative: ${altUrl}`);
        result.isValid = true;
        result.validatedUrl = altUrl;
        result.feedType = altTest.feedType;
        result.suggestedFix = `Use alternative RSS feed: ${altUrl}`;
        return result;
      }
    }

    // Generate suggestions based on the error
    if (originalTest.error?.includes('404')) {
      result.suggestedFix = 'RSS feed not found. Check website for current feed URL or contact site administrator.';
    } else if (originalTest.error?.includes('certificate')) {
      result.suggestedFix = 'SSL certificate issue. Try using HTTP instead of HTTPS, or contact site administrator.';
    } else if (originalTest.error?.includes('403')) {
      result.suggestedFix = 'Access forbidden. Source may be blocking automated requests. Consider manual review.';
    } else if (originalTest.error?.includes('timeout')) {
      result.suggestedFix = 'Source is slow or unresponsive. May need increased timeout or different approach.';
    } else {
      result.suggestedFix = 'General connectivity issue. Verify URL is accessible and RSS feed is active.';
    }

    return result;

  } catch (error) {
    result.errorMessage = error instanceof Error ? error.message : String(error);
    result.suggestedFix = 'Validation process failed. Manual review required.';
    return result;
  }
}

async function testFeedUrl(url: string): Promise<{ isValid: boolean; feedType?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Try HTTPS first, then HTTP for SSL issues
    let testUrl = url;
    if (url.startsWith('http://')) {
      // If it's already HTTP, also try HTTPS
      const httpsUrl = url.replace('http://', 'https://');
      try {
        const httpsResponse = await fetch(httpsUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FeedValidator/1.0)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
          }
        });
        
        if (httpsResponse.ok) {
          testUrl = httpsUrl; // Use HTTPS if it works
        }
      } catch {
        // If HTTPS fails, continue with HTTP
      }
    }

    const response = await fetch(testUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FeedValidator/1.0)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // For SSL certificate errors, try HTTP
      if (response.status === 0 && testUrl.startsWith('https://')) {
        const httpUrl = testUrl.replace('https://', 'http://');
        return await testFeedUrl(httpUrl);
      }
      
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();

    // Validate RSS/Atom content
    let feedType = 'unknown';
    let isValid = false;

    if (content.includes('<rss') && content.includes('<channel')) {
      feedType = 'RSS 2.0';
      isValid = true;
    } else if (content.includes('<feed') && content.includes('xmlns')) {
      feedType = 'Atom';
      isValid = true;
    } else if (content.includes('<rdf:RDF')) {
      feedType = 'RSS 1.0/RDF';
      isValid = true;
    } else if (contentType.includes('xml') && (content.includes('<item') || content.includes('<entry'))) {
      feedType = 'XML Feed';
      isValid = true;
    }

    if (!isValid) {
      return {
        isValid: false,
        error: 'Content is not a valid RSS/Atom feed'
      };
    }

    return {
      isValid: true,
      feedType
    };

  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      return {
        isValid: false,
        error: 'Request timed out'
      };
    }

    // Handle SSL certificate errors
    if (error instanceof Error && error.message.includes('certificate') && url.startsWith('https://')) {
      const httpUrl = url.replace('https://', 'http://');
      return await testFeedUrl(httpUrl);
    }

    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function discoverAlternativeFeeds(source: any): Promise<string[]> {
  const alternatives: string[] = [];
  
  try {
    // Extract base domain
    const baseUrl = new URL(source.feed_url).origin;
    
    // Common RSS feed patterns to try
    const patterns = [
      '/feed/',
      '/rss/',
      '/rss.xml',
      '/feed.xml',
      '/atom.xml',
      '/news/feed/',
      '/blog/feed/',
      '/feeds/all.xml',
      '/index.xml',
      '/wp/feed/',
      '/wordpress/feed/'
    ];

    // Add pattern-based alternatives
    for (const pattern of patterns) {
      const altUrl = baseUrl + pattern;
      if (altUrl !== source.feed_url) {
        alternatives.push(altUrl);
      }
    }

    // For government sites, try specific patterns
    if (baseUrl.includes('.gov') || baseUrl.includes('council')) {
      const govPatterns = [
        '/news.rss',
        '/news/rss',
        '/feeds/news.xml',
        '/api/rss',
        '/press/feed'
      ];
      
      for (const govPattern of govPatterns) {
        alternatives.push(baseUrl + govPattern);
      }
    }

    // Try to scrape the homepage for RSS links
    try {
      const homeResponse = await fetch(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FeedDiscovery/1.0)',
        }
      });
      
      if (homeResponse.ok) {
        const html = await homeResponse.text();
        const feedLinks = extractFeedLinksFromHTML(html, baseUrl);
        alternatives.push(...feedLinks);
      }
    } catch (error) {
      console.log(`⚠️ Could not scrape homepage for feed links: ${error instanceof Error ? error.message : String(error)}`);
    }

  } catch (error) {
    console.log(`⚠️ Error discovering alternatives: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Remove duplicates and original URL
  return [...new Set(alternatives)].filter(url => url !== source.feed_url);
}

function extractFeedLinksFromHTML(html: string, baseUrl: string): string[] {
  const feedLinks: string[] = [];
  
  // Look for RSS/Atom feed links in HTML
  const linkMatches = html.match(/<link[^>]+type=["'](application\/(rss\+xml|atom\+xml)|text\/xml)["'][^>]*>/gi) || [];
  
  for (const linkMatch of linkMatches) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
    if (hrefMatch) {
      try {
        const feedUrl = new URL(hrefMatch[1], baseUrl).href;
        feedLinks.push(feedUrl);
      } catch {
        // Skip invalid URLs
      }
    }
  }

  // Also look for common RSS link text
  const rssLinkMatches = html.match(/<a[^>]+href=["']([^"']*(?:rss|feed|atom)[^"']*)["'][^>]*>/gi) || [];
  
  for (const linkMatch of rssLinkMatches) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
    if (hrefMatch) {
      try {
        const feedUrl = new URL(hrefMatch[1], baseUrl).href;
        feedLinks.push(feedUrl);
      } catch {
        // Skip invalid URLs
      }
    }
  }

  return feedLinks;
}