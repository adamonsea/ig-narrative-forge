import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { MultiTenantDatabaseOperations } from '../_shared/multi-tenant-database-operations.ts';
import { FastTrackScraper } from '../_shared/fast-track-scraper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UniversalScrapeRequest {
  topicId: string;
  sourceIds?: string[];
  forceRescrape?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { topicId, sourceIds, forceRescrape = false } = await req.json() as UniversalScrapeRequest;

    console.log('Universal Topic Scraper - Starting for topic:', topicId);

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Get topic sources using junction table
    const { data: topicSources, error: sourcesError } = await supabase
      .rpc('get_topic_sources', { p_topic_id: topicId });

    if (sourcesError) {
      throw new Error(`Failed to get topic sources: ${sourcesError.message}`);
    }

    // Filter sources if specific sourceIds provided
    const targetSources = sourceIds 
      ? topicSources.filter(source => sourceIds.includes(source.source_id))
      : topicSources;

    if (!targetSources || targetSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No sources to scrape',
          topicId,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${targetSources.length} sources for topic: ${topic.name}`);

    const scraper = new FastTrackScraper(supabase);
    const dbOps = new MultiTenantDatabaseOperations(supabase);
    const results = [];

    // Process each source
    for (const source of targetSources) {
      try {
        console.log(`Scraping source: ${source.source_name} (${source.feed_url})`);

        // Execute scraping
        const scrapeResult = await scraper.scrapeContent(
          source.feed_url,
          source.source_id,
          {
            forceRescrape,
            userAgent: 'eeZee Universal Topic Scraper/1.0',
            timeout: 30000,
          }
        );

        if (scrapeResult.success && scrapeResult.articles.length > 0) {
          // Store articles using multi-tenant approach
          const storeResult = await dbOps.storeArticles(
            scrapeResult.articles,
            topicId,
            source.source_id
          );

          // Update source metrics
          await supabase
            .from('content_sources')
            .update({
              articles_scraped: source.articles_scraped + scrapeResult.articlesScraped,
              last_scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', source.source_id);

          results.push({
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: true,
            articlesFound: scrapeResult.articlesFound,
            articlesScraped: scrapeResult.articlesScraped,
            multiTenantStored: storeResult.articlesStored,
            method: scrapeResult.method
          });

          console.log(`✓ ${source.source_name}: ${scrapeResult.articlesScraped} articles`);
        } else {
          results.push({
            sourceId: source.source_id,
            sourceName: source.source_name,
            success: false,
            error: scrapeResult.errors.join(', ') || 'No articles found',
            articlesFound: 0,
            articlesScraped: 0
          });

          console.log(`✗ ${source.source_name}: ${scrapeResult.errors.join(', ')}`);
        }
      } catch (sourceError) {
        console.error(`Error scraping ${source.source_name}:`, sourceError);
        
        results.push({
          sourceId: source.source_id,
          sourceName: source.source_name,
          success: false,
          error: sourceError.message,
          articlesFound: 0,
          articlesScraped: 0
        });
      }
    }

    // Log system event
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Universal topic scraping completed',
        context: {
          topicId,
          topicName: topic.name,
          sourcesProcessed: targetSources.length,
          totalArticles: results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0),
          successfulSources: results.filter(r => r.success).length
        },
        function_name: 'universal-topic-scraper'
      });

    const totalArticles = results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0);
    const successfulSources = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        topicId,
        topicName: topic.name,
        sourcesProcessed: targetSources.length,
        successfulSources,
        totalArticles,
        results,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Universal Topic Scraper Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});