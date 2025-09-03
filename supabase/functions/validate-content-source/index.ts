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

    // Test basic accessibility
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0; +https://eezee.news)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        redirect: 'follow'
      });

      result.isAccessible = response.ok;
      result.contentType = response.headers.get('content-type') || 'unknown';

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('✅ Source is accessible:', { status: response.status, contentType: result.contentType });

    } catch (error) {
      result.error = `Network error: ${error.message}`;
      console.error('❌ Network error:', error);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

    // Test scraping functionality (optional - only if we have topicId)
    if (topicId && result.isAccessible) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (!supabaseUrl || !supabaseServiceKey) {
          result.warnings.push('Cannot test scraping: Supabase configuration missing');
        } else {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
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
        }
      } catch (error) {
        result.warnings.push(`Scraper test error: ${error.message}`);
        console.error('❌ Scraper test failed:', error);
      }
    }

    // Determine overall success
    result.success = result.isAccessible && 
      (sourceType !== 'RSS' || result.isValidRSS !== false) &&
      result.warnings.length < 3; // Allow up to 2 warnings

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