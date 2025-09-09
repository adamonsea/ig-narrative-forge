import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnifiedScrapingRequest {
  indexUrl: string;
  topicId: string;
  sourceId?: string;
  maxArticles?: number;
  fallbackToScreenshot?: boolean;
}

interface UnifiedScrapingResult {
  success: boolean;
  method: string;
  indexUrl: string;
  topicId: string;
  urlsDiscovered: number;
  articlesExtracted: number;
  articlesStored: number;
  duplicatesSkipped: number;
  responseTime: number;
  errors: string[];
  discoveredUrls: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      indexUrl, 
      topicId, 
      sourceId, 
      maxArticles = 20,
      fallbackToScreenshot = true 
    }: UnifiedScrapingRequest = await req.json();

    if (!indexUrl || !topicId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: indexUrl and topicId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Unified scraper started: ${indexUrl} for topic ${topicId}`);

    // Log scraper selection details for debugging
    const isIndex = indexUrl.includes('hastingsobserver') || indexUrl.includes('theargus') || indexUrl.includes('bbc.co.uk/news');
    console.log(`🔍 Index page detection: ${isIndex ? 'YES' : 'NO'} for ${indexUrl}`);
    console.log(`🔧 Scraper routing: unified-scraper selected (two-phase processing)`);

    const result: UnifiedScrapingResult = {
      success: false,
      method: 'two-phase-scraping',
      indexUrl,
      topicId,
      urlsDiscovered: 0,
      articlesExtracted: 0,
      articlesStored: 0,
      duplicatesSkipped: 0,
      responseTime: 0,
      errors: [],
      discoveredUrls: []
    };

    // Phase 1: Discover article URLs from index page
    console.log(`🔍 Phase 1: Discovering article URLs from ${indexUrl}`);
    
    const discoveryResult = await supabase.functions.invoke('discover-article-urls', {
      body: { 
        indexUrl, 
        sourceId, 
        maxUrls: maxArticles 
      }
    });

    if (discoveryResult.error || !discoveryResult.data?.success) {
      const errorMsg = discoveryResult.error?.message || discoveryResult.data?.errors?.[0] || 'Unknown error';
      result.errors.push(`URL discovery failed: ${errorMsg}`);
      console.log(`❌ Phase 1 failed: ${errorMsg}`);
      
      // Fallback: try direct scraping of index URL as if it were an article
      console.log(`⚠️ URL discovery failed, trying direct extraction fallback`);
      const directResult = await supabase.functions.invoke('content-extractor-multi-tenant', {
        body: { 
          urls: [indexUrl], 
          topicId, 
          sourceId, 
          fallbackToScreenshot 
        }
      });
      
      if (directResult.data?.success && directResult.data.articlesExtracted > 0) {
        result.success = true;
        result.method = 'direct-fallback';
        result.articlesExtracted = directResult.data.articlesExtracted;
        result.articlesStored = directResult.data.articlesStored;
        result.duplicatesSkipped = directResult.data.duplicatesSkipped;
        result.errors.push(...(directResult.data.errors || []));
      } else {
        result.errors.push('Direct extraction fallback also failed');
      }
      
      result.responseTime = Date.now() - startTime;
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const discoveredUrls = discoveryResult.data.discoveredUrls || [];
    result.urlsDiscovered = discoveredUrls.length;
    result.discoveredUrls = discoveredUrls.slice(0, 5); // Include first 5 for debugging

    console.log(`✅ Phase 1 complete: ${result.urlsDiscovered} URLs discovered`);

    if (result.urlsDiscovered === 0) {
      result.errors.push('No article URLs discovered from index page');
      result.responseTime = Date.now() - startTime;
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Phase 2: Extract content from discovered URLs
    console.log(`🔄 Phase 2: Extracting content from ${result.urlsDiscovered} URLs`);
    
    const extractionResult = await supabase.functions.invoke('content-extractor-multi-tenant', {
      body: { 
        urls: discoveredUrls.map(u => u.url), 
        topicId, 
        sourceId, 
        maxConcurrent: 3, // Conservative concurrent limit
        fallbackToScreenshot 
      }
    });

    if (extractionResult.error) {
      result.errors.push(`Content extraction failed: ${extractionResult.error.message}`);
    } else if (extractionResult.data) {
      result.articlesExtracted = extractionResult.data.articlesExtracted || 0;
      result.articlesStored = extractionResult.data.articlesStored || 0;
      result.duplicatesSkipped = extractionResult.data.duplicatesSkipped || 0;
      result.errors.push(...(extractionResult.data.errors || []));
      
      console.log(`✅ Phase 2 complete: ${result.articlesExtracted} articles extracted, ${result.articlesStored} stored`);
    }

    result.success = result.articlesStored > 0;
    result.responseTime = Date.now() - startTime;

    // Update source metrics if provided
    if (sourceId && result.success) {
      await supabase
        .from('content_sources')
        .update({
          articles_scraped: supabase.sql`articles_scraped + ${result.articlesStored}`,
          last_scraped_at: new Date().toISOString()
        })
        .eq('id', sourceId);
    }

    // Log completion
    await supabase.from('system_logs').insert({
      level: result.success ? 'info' : 'warn',
      message: `Unified scraper completed: ${result.articlesStored} articles stored`,
      context: {
        indexUrl,
        topicId,
        sourceId,
        urlsDiscovered: result.urlsDiscovered,
        articlesExtracted: result.articlesExtracted,
        articlesStored: result.articlesStored,
        duplicatesSkipped: result.duplicatesSkipped,
        responseTime: result.responseTime,
        method: result.method,
        errorsCount: result.errors.length
      },
      function_name: 'unified-scraper'
    });

    console.log(`🎉 Unified scraper complete: ${result.articlesStored} articles stored in ${result.responseTime}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Unified scraper error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      method: 'two-phase-scraping',
      indexUrl: '',
      topicId: '',
      urlsDiscovered: 0,
      articlesExtracted: 0,
      articlesStored: 0,
      duplicatesSkipped: 0,
      responseTime: Date.now() - startTime,
      errors: [error.message],
      discoveredUrls: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});