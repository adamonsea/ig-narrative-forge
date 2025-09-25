import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationRequest {
  topicIds?: string[];
  dryRun?: boolean;
  force?: boolean;
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
    const { topicIds, dryRun = false, force = false } = await req.json() as AutomationRequest;

    console.log('Universal Topic Automation - Starting automation check');

    // Get topics that need scraping
    let topicsQuery = supabase
      .from('topics')
      .select(`
        id,
        name,
        is_active,
        topic_automation_settings (
          scrape_frequency_hours,
          is_active,
          last_run_at,
          next_run_at
        )
      `)
      .eq('is_active', true);

    if (topicIds && topicIds.length > 0) {
      topicsQuery = topicsQuery.in('id', topicIds);
    }

    const { data: topics, error: topicsError } = await topicsQuery;

    if (topicsError) {
      throw new Error(`Failed to get topics: ${topicsError.message}`);
    }

    if (!topics || topics.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active topics found for automation',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const topicsToScrape = topics.filter(topic => {
      if (!topic.topic_automation_settings?.[0]?.is_active) {
        return false;
      }

      const settings = topic.topic_automation_settings[0];
      
      if (force) {
        return true;
      }

      // Check if it's time to scrape
      const nextRunAt = new Date(settings.next_run_at);
      return now >= nextRunAt;
    });

    console.log(`Found ${topicsToScrape.length} topics ready for automated scraping`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          topicsToScrape: topicsToScrape.map(t => ({
            id: t.id,
            name: t.name,
            nextRunAt: t.topic_automation_settings[0]?.next_run_at,
            frequency: t.topic_automation_settings[0]?.scrape_frequency_hours
          })),
          message: `${topicsToScrape.length} topics would be scraped`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    // Process each topic
    for (const topic of topicsToScrape) {
      try {
        console.log(`Starting automated scraping for topic: ${topic.name}`);

        // Call the universal topic scraper
        const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke(
          'universal-topic-scraper',
          {
            body: {
              topicId: topic.id,
              forceRescrape: false
            }
          }
        );

        if (scrapeError) {
          throw new Error(`Scraping failed: ${scrapeError.message}`);
        }

        // Update automation settings
        const settings = topic.topic_automation_settings[0];
        const nextRunAt = new Date(now.getTime() + (settings.scrape_frequency_hours * 60 * 60 * 1000));

        await supabase
          .from('topic_automation_settings')
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRunAt.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('topic_id', topic.id);

        results.push({
          topicId: topic.id,
          topicName: topic.name,
          success: true,
          articlesScraped: scrapeResult?.totalArticles || 0,
          sourcesProcessed: scrapeResult?.sourcesProcessed || 0,
          nextRunAt: nextRunAt.toISOString(),
          executedAt: now.toISOString()
        });

        console.log(`✓ ${topic.name}: ${scrapeResult?.totalArticles || 0} articles scraped`);

        } catch (topicError) {
          console.error(`Error processing topic ${topic.name}:`, topicError);
          
          results.push({
            topicId: topic.id,
            topicName: topic.name,
            success: false,
            error: topicError instanceof Error ? topicError.message : String(topicError),
            executedAt: now.toISOString()
          });
        }
    }

    // Log automation event
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Universal topic automation completed',
        context: {
          topicsProcessed: topicsToScrape.length,
          successfulTopics: results.filter(r => r.success).length,
          totalArticles: results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0),
          force,
          dryRun
        },
        function_name: 'universal-topic-automation'
      });

    const successfulTopics = results.filter(r => r.success).length;
    const totalArticles = results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        topicsProcessed: topicsToScrape.length,
        successfulTopics,
        totalArticles,
        results,
        timestamp: now.toISOString()
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Universal Topic Automation Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
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