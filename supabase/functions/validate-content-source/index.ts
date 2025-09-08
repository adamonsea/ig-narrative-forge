import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
    let errorMsg = error.message;
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

    // For RSS sources, validate feed format
    if (sourceType === 'RSS') {
      try {
        const feedResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0; +https://eezee.news)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
          }
        });

        if (feedResponse.ok) {
          const feedContent = await feedResponse.text();
          const isRSS = feedContent.includes('<rss') || feedContent.includes('<feed');
          const hasItems = feedContent.includes('<item>') || feedContent.includes('<entry>');
          
          result.isValidRSS = isRSS;
          result.hasRecentContent = hasItems;

          if (!isRSS) {
            result.warnings.push('URL does not appear to contain valid RSS/Atom feed');
          }
          if (!hasItems) {
            result.warnings.push('RSS feed appears to be empty or has no items');
          }

          // Count approximate articles
          const itemMatches = feedContent.match(/<item>|<entry>/g);
          result.articleCount = itemMatches ? itemMatches.length : 0;

          console.log('📊 RSS validation:', { isRSS, hasItems, articleCount: result.articleCount });
        } else {
          result.warnings.push(`Could not fetch RSS content: HTTP ${feedResponse.status}`);
        }
      } catch (error) {
        result.warnings.push(`RSS validation failed: ${error.message}`);
      }
    }

    // Check for topic-scoped duplicates (only if we have topicId)
    if (topicId && result.isAccessible) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          // Check if this URL already exists for this specific topic
          const { data: existingTopicSource } = await supabase
            .from('topic_sources')
            .select(`
              id,
              content_sources!inner(feed_url, source_name)
            `)
            .eq('topic_id', topicId)
            .eq('content_sources.feed_url', url)
            .eq('is_active', true)
            .maybeSingle();

          if (existingTopicSource) {
            result.success = false;
            result.error = 'This source is already active for this topic';
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Test scraping functionality
          // Determine which scraper to use
          const scraperFunction = topicType === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
          
          const scraperPayload = topicType === 'regional' 
            ? { feedUrl: url, region: region || 'default' }
            : { feedUrl: url, topicId };

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
        result.warnings.push(`Validation error: ${error.message}`);
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
        error: error.message,
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