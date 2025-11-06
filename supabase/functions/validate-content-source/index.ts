import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  url: string;
  sourceType: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official';
  topicType: 'regional' | 'keyword';
  region?: string;
  topicId?: string;
}

interface ValidationResult {
  success: boolean;
  isAccessible: boolean;
  isValidRSS?: boolean;
  contentType?: string;
  hasRecentContent?: boolean;
  articleCount?: number;
  error?: string;
  warnings: string[];
  scraperTest?: {
    success: boolean;
    articlesFound: number;
    error?: string;
  };
  arcInfo?: {
    arcCompatible: boolean;
    arcSite?: string;
    sectionPath?: string;
    articlesFound?: number;
    testSuccess?: boolean;
  };
}

// Helper function to test URL accessibility with better error handling
async function testAccessibility(url: string): Promise<{success: boolean, contentType?: string, error?: string}> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0; +https://eezee.news)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return {
      success: true,
      contentType: response.headers.get('content-type') || 'unknown'
    };

  } catch (error) {
    // Better error categorization
    let errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('certificate') || errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
      errorMsg = 'SSL/TLS certificate error - source may have security issues';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      errorMsg = 'Connection timeout - source may be slow or unreliable';
    } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
      errorMsg = 'Domain not found - source may no longer exist';
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ECONNRESET')) {
      errorMsg = 'Connection refused - source may be blocking requests';
    }
    
    return {
      success: false,
      error: `Network error: ${errorMsg}`
    };
  }
}

// RSS Discovery functions (borrowed from validate-and-fix-sources)
async function discoverRSSFeeds(url: string): Promise<string[]> {
  const alternatives: string[] = [];
  
  try {
    // Extract base domain
    const baseUrl = new URL(url).origin;
    
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
      if (altUrl !== url) {
        alternatives.push(altUrl);
      }
    }

    // For specific domains, add targeted patterns
    if (baseUrl.includes('sussexexpress.co.uk')) {
      alternatives.push(baseUrl + '/news/local/hastings/rss');
      alternatives.push(baseUrl + '/news/rss');
    }
    if (baseUrl.includes('theargus.co.uk')) {
      alternatives.push(baseUrl + '/news/rss/');
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

    // Try to scrape the original URL for RSS links
    try {
      const homeResponse = await fetch(url, {
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
      console.log(`⚠️ Could not scrape page for feed links: ${error instanceof Error ? error.message : String(error)}`);
    }

  } catch (error) {
    console.log(`⚠️ Error discovering RSS feeds: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Remove duplicates and original URL
  return [...new Set(alternatives)].filter(feedUrl => feedUrl !== url);
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

async function testRSSFeed(url: string): Promise<{isValidRSS: boolean, articleCount: number, hasContent: boolean}> {
  try {
    const feedResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0; +https://eezee.news)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
      }
    });

    if (!feedResponse.ok) {
      return { isValidRSS: false, articleCount: 0, hasContent: false };
    }

    const feedContent = await feedResponse.text();
    const isRSS = feedContent.includes('<rss') || feedContent.includes('<feed');
    const hasItems = feedContent.includes('<item>') || feedContent.includes('<entry>');
    
    // Count approximate articles
    const itemMatches = feedContent.match(/<item>|<entry>/g);
    const articleCount = itemMatches ? itemMatches.length : 0;

    return { 
      isValidRSS: isRSS, 
      articleCount, 
      hasContent: hasItems && articleCount > 0 
    };
  } catch (error) {
    console.log(`⚠️ RSS test failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return { isValidRSS: false, articleCount: 0, hasContent: false };
  }
}

// Extract section path from URL for Arc API compatibility
function extractSectionPath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Remove trailing slashes and extract path
    const cleanPath = pathname.replace(/\/$/, '');
    
    // If it's just the root or too short, return null
    if (!cleanPath || cleanPath === '/' || cleanPath.length < 3) {
      return null;
    }
    
    return cleanPath;
  } catch {
    return null;
  }
}

// Detect if domain is Newsquest/Arc-enabled
function isNewsquestDomain(url: string): { isNewsquest: boolean; arcSite?: string; domain?: string } {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    
    // Known Newsquest domains and their Arc site slugs
    const newsquestDomains: Record<string, string> = {
      'theargus.co.uk': 'theargus',
      'sussexexpress.co.uk': 'sussexexpress',
      'hastingsobserver.co.uk': 'hastingsobserver',
      'eastbourneherald.co.uk': 'eastbourneherald',
      'chichester.co.uk': 'chichester'
    };
    
    if (newsquestDomains[domain]) {
      return {
        isNewsquest: true,
        arcSite: newsquestDomains[domain],
        domain
      };
    }
    
    // Check for other Newsquest patterns
    if (domain.includes('newsquest') || domain.endsWith('herald.co.uk') || domain.endsWith('observer.co.uk')) {
      return {
        isNewsquest: true,
        domain
      };
    }
    
    return { isNewsquest: false };
  } catch {
    return { isNewsquest: false };
  }
}

// Test Arc API compatibility
async function testArcApiCompatibility(url: string): Promise<{
  arcCompatible: boolean;
  arcSite?: string;
  sectionPath?: string;
  articlesFound?: number;
  testSuccess?: boolean;
  error?: string;
}> {
  const newsquestCheck = isNewsquestDomain(url);
  
  if (!newsquestCheck.isNewsquest) {
    return { arcCompatible: false };
  }
  
  const sectionPath = extractSectionPath(url);
  
  if (!sectionPath) {
    return {
      arcCompatible: false,
      error: 'Could not extract section path from URL'
    };
  }
  
  console.log(`🔍 Testing Arc API: domain=${newsquestCheck.domain}, arcSite=${newsquestCheck.arcSite}, section=${sectionPath}`);
  
  // Try to fetch from Arc API
  try {
    const arcApiUrl = `https://${newsquestCheck.domain}/pf/api/v3/content/fetch/story-feed-query-with-size?query={"feedOffset":0,"feedSize":5,"includeSections":"${sectionPath}","website":"${newsquestCheck.arcSite}"}`;
    
    const response = await fetch(arcApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0)',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return {
        arcCompatible: false,
        arcSite: newsquestCheck.arcSite,
        sectionPath,
        testSuccess: false,
        error: `Arc API returned ${response.status}`
      };
    }
    
    const data = await response.json();
    const articlesFound = data?.content_elements?.length || 0;
    
    console.log(`✅ Arc API test successful: ${articlesFound} articles found`);
    
    return {
      arcCompatible: true,
      arcSite: newsquestCheck.arcSite,
      sectionPath,
      articlesFound,
      testSuccess: articlesFound > 0
    };
  } catch (error) {
    console.error('Arc API test failed:', error);
    return {
      arcCompatible: false,
      arcSite: newsquestCheck.arcSite,
      sectionPath,
      testSuccess: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, sourceType, topicType, region, topicId }: ValidationRequest = await req.json();

    console.log('🔍 Validating source:', { url, sourceType, topicType });

    const result: ValidationResult = {
      success: false,
      isAccessible: false,
      warnings: []
    };

    // Test basic accessibility with fallbacks
    let accessibilityResult = await testAccessibility(url);
    
    if (!accessibilityResult.success && url.startsWith('https://')) {
      // Try HTTP fallback for HTTPS URLs that fail due to SSL issues
      const httpUrl = url.replace('https://', 'http://');
      console.log('🔄 Trying HTTP fallback:', httpUrl);
      accessibilityResult = await testAccessibility(httpUrl);
      if (accessibilityResult.success) {
        result.warnings.push('HTTPS failed, but HTTP works - may have SSL certificate issues');
      }
    }
    
    result.isAccessible = accessibilityResult.success;
    result.contentType = accessibilityResult.contentType;
    
    if (!accessibilityResult.success) {
      result.error = accessibilityResult.error;
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Source is accessible:', { contentType: result.contentType });

    // Test Arc API compatibility for all sources (Newsquest detection)
    const arcTest = await testArcApiCompatibility(url);
    if (arcTest.arcCompatible) {
      result.arcInfo = arcTest;
      console.log('🎯 Arc API compatible:', arcTest);
      
      if (arcTest.testSuccess && arcTest.articlesFound && arcTest.articlesFound > 0) {
        result.warnings.push(`✓ Arc API compatible - will use fast scraping (${arcTest.articlesFound} articles found)`);
      } else {
        result.warnings.push('Arc API detected but returned no articles - may need section path adjustment');
      }
    }

    // For RSS sources, validate feed format and discover alternatives if needed
    if (sourceType === 'RSS') {
      const rssTest = await testRSSFeed(url);
      result.isValidRSS = rssTest.isValidRSS;
      result.hasRecentContent = rssTest.hasContent;
      result.articleCount = rssTest.articleCount;

      // If the provided URL is not a valid RSS feed, try to discover RSS feeds
      if (!rssTest.isValidRSS) {
        console.log('🔍 URL is not RSS, attempting to discover feeds...');
        
        const discoveredFeeds = await discoverRSSFeeds(url);
        result.discoveredFeeds = discoveredFeeds;
        
        if (discoveredFeeds.length > 0) {
          // Test the discovered feeds to find the best one
          let bestFeed = null;
          let bestScore = 0;
          
          for (const feedUrl of discoveredFeeds.slice(0, 5)) { // Test up to 5 feeds
            const feedTest = await testRSSFeed(feedUrl);
            if (feedTest.isValidRSS && feedTest.hasContent) {
              const score = feedTest.articleCount + (feedTest.hasContent ? 10 : 0);
              if (score > bestScore) {
                bestFeed = feedUrl;
                bestScore = score;
              }
            }
          }
          
          if (bestFeed) {
            result.suggestedUrl = bestFeed;
            const suggestedTest = await testRSSFeed(bestFeed);
            result.isValidRSS = suggestedTest.isValidRSS;
            result.hasRecentContent = suggestedTest.hasContent;
            result.articleCount = suggestedTest.articleCount;
            
            result.warnings.push(`Original URL is not an RSS feed. Found working RSS feed: ${bestFeed}`);
            console.log('✅ Found working RSS feed:', bestFeed);
          } else {
            result.warnings.push('URL does not appear to contain valid RSS/Atom feed, and no working RSS feeds were discovered');
          }
        } else {
          result.warnings.push('URL does not appear to contain valid RSS/Atom feed, and no alternative feeds could be discovered');
        }
      } else {
        console.log('📊 RSS validation:', { isValidRSS: rssTest.isValidRSS, hasContent: rssTest.hasContent, articleCount: rssTest.articleCount });
        
        if (!rssTest.hasContent) {
          result.warnings.push('RSS feed appears to be empty or has no items');
        }
      }
    }

    // Test scraping functionality if topicId provided (removed duplicate check - handled client-side)
    if (topicId && result.isAccessible) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          // Test scraping functionality using unified approach
          const scraperFunction = 'universal-topic-scraper'; // All topics use unified scraper now
          
          // Use the suggested URL if we discovered a better RSS feed
          const testUrl = result.suggestedUrl || url;
          
          const scraperPayload = topicType === 'regional' 
            ? { feedUrl: testUrl, region: region || 'default' }
            : { feedUrl: testUrl, topicId };

          console.log('🚀 Testing scraper:', { scraperFunction, payload: scraperPayload });

          const { data: scraperResult, error: scraperError } = await supabase.functions.invoke(scraperFunction, {
            body: scraperPayload
          });

          if (scraperError) {
            result.scraperTest = {
              success: false,
              articlesFound: 0,
              error: scraperError.message
            };
            result.warnings.push(`Scraper test failed: ${scraperError.message}`);
          } else if (scraperResult) {
            result.scraperTest = {
              success: scraperResult.success || false,
              articlesFound: scraperResult.articlesFound || 0,
              error: scraperResult.success ? undefined : 'Scraping returned no articles'
            };
            
            if (!scraperResult.success || scraperResult.articlesFound === 0) {
              result.warnings.push('Test scraping found no recent articles');
            }
            
            console.log('📈 Scraper test result:', result.scraperTest);
          }
        } else {
          result.warnings.push('Cannot test scraping: Supabase configuration missing');
        }
    } catch (error) {
      result.warnings.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('❌ Validation failed:', error);
    }
    }

    // Determine overall success - be very lenient, focus on accessibility
    result.success = result.isAccessible && result.warnings.length < 6; // Allow up to 5 warnings

    console.log('🎯 Validation complete:', { success: result.success, warnings: result.warnings.length });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Validation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        isAccessible: false,
        warnings: ['Validation process failed']
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
