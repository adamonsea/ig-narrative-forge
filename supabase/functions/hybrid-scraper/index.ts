import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Import shared utilities
import { ScrapingResult } from '../_shared/types.ts';
import { ScrapingStrategies } from '../_shared/scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region } = await req.json();
    console.log(`🚀 Starting hybrid scrape for: ${feedUrl}`);
    
    // Get source information to determine region and type
    const { data: sourceInfo } = await supabase
      .from('content_sources')
      .select('region, source_type, source_name, canonical_domain')
      .eq('id', sourceId)
      .single();

    const targetRegion = region || sourceInfo?.region || 'Eastbourne';
    console.log(`📍 Target region: ${targetRegion}, Source type: ${sourceInfo?.source_type}`);
    
    const startTime = Date.now();
    
    // Initialize scraping strategies and database operations
    const scrapingStrategies = new ScrapingStrategies(targetRegion, sourceInfo);
    const dbOps = new DatabaseOperations(supabase);
    
    let result: ScrapingResult;

    // Strategy 1: Try RSS/Atom first (most reliable)
    result = await scrapingStrategies.tryRSSParsing(feedUrl);
    
    // Strategy 2: If RSS fails, try HTML parsing
    if (!result.success) {
      console.log('📄 RSS failed, trying HTML parsing...');
      result = await scrapingStrategies.tryHTMLParsing(feedUrl);
    }
    
    // Strategy 3: Fallback to basic content extraction
    if (!result.success) {
      console.log('🔧 HTML parsing failed, trying fallback method...');
      result = await scrapingStrategies.tryFallbackMethod(feedUrl);
    }

    if (!result.success) {
      await dbOps.logSystemEvent('error', 'All scraping methods failed', {
        feedUrl,
        sourceId,
        errors: result.errors
      }, 'hybrid-scraper');
      
      throw new Error('All scraping methods failed - no articles found');
    }

    console.log(`✅ Found ${result.articlesFound} articles using ${result.method}`);

    // Store articles using the new database operations
    const storeResults = await dbOps.storeArticles(result.articles, sourceId, targetRegion);
    
    // Update source metrics
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await dbOps.updateSourceMetrics(sourceId, result.success, result.method, responseTime);
    }

    // Log successful scraping
    await dbOps.logSystemEvent('info', 'Hybrid scraping completed successfully', {
      feedUrl,
      sourceId,
      articlesFound: result.articlesFound,
      articlesStored: storeResults.stored,
      duplicates: storeResults.duplicates,
      discarded: storeResults.discarded,
      method: result.method,
      responseTime: Date.now() - startTime
    }, 'hybrid-scraper');

    return new Response(JSON.stringify({
      success: true,
      articlesFound: result.articlesFound,
      articlesScraped: storeResults.stored,
      duplicates: storeResults.duplicates,
      discarded: storeResults.discarded,
      method: result.method,
      responseTime: Date.now() - startTime,
      articles: result.articles
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Hybrid scraper error:', error);
    
    // Log the error
    try {
      const dbOps = new DatabaseOperations(supabase);
      await dbOps.logSystemEvent('error', 'Hybrid scraper failed', {
        error: error.message,
        stack: error.stack
      }, 'hybrid-scraper');
    } catch (logError) {
      console.error('❌ Failed to log error:', logError);
    }
    
    return new Response(JSON.stringify({
        success: false,
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'none',
        articles: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});