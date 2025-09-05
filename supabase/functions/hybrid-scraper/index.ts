import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region, topicId } = await req.json();

    if (!feedUrl || !sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: feedUrl, sourceId' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🎯 Hybrid scraper starting for source: ${sourceId}`);
    console.log(`🌐 Target URL: ${feedUrl}`);

    // Get source information to determine the best scraping approach
    const { data: source, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      console.error('❌ Failed to fetch source information:', sourceError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Source not found',
          articles_imported: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let scrapeResult;

    // Choose scraping strategy based on topic type and source
    if (topicId) {
      // Get topic information
      const { data: topic } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topic && topic.topic_type === 'keyword') {
        console.log('🔍 Using topic-aware scraper for keyword-based topic');
        // Use topic-aware scraper for keyword topics
        scrapeResult = await supabase.functions.invoke('topic-aware-scraper', {
          body: { feedUrl, sourceId, topicId }
        });
      } else {
        console.log('🌍 Using universal scraper for regional topic');
        // Use universal scraper for regional topics
        scrapeResult = await supabase.functions.invoke('universal-scraper', {
          body: { feedUrl, sourceId, region: region || 'General' }
        });
      }
    } else {
      console.log('📰 Using universal scraper for general scraping');
      // Default to universal scraper
      scrapeResult = await supabase.functions.invoke('universal-scraper', {
        body: { feedUrl, sourceId, region: region || 'General' }
      });
    }

    if (scrapeResult.error) {
      console.error('❌ Primary scraper failed, trying Beautiful Soup fallback:', scrapeResult.error);
      
      // Try Beautiful Soup as fallback
      const fallbackResult = await supabase.functions.invoke('beautiful-soup-scraper', {
        body: { feedUrl, sourceId, region: region || 'General' }
      });

      if (fallbackResult.error) {
        console.error('❌ Fallback scraper also failed:', fallbackResult.error);
        
        // Update source metrics with failure
        await supabase.rpc('log_error_ticket', {
          p_ticket_type: 'scraping_failure',
          p_source_info: { 
            source_id: sourceId, 
            source_name: source.source_name,
            feed_url: feedUrl 
          },
          p_error_details: `Both primary and fallback scrapers failed: ${scrapeResult.error?.message || 'Unknown error'}`,
          p_severity: 'medium',
          p_context_data: { 
            primary_error: scrapeResult.error,
            fallback_error: fallbackResult.error
          }
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `All scrapers failed: ${scrapeResult.error?.message || 'Unknown error'}`,
            articles_imported: 0 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      scrapeResult = fallbackResult;
    }

    const result = scrapeResult.data || scrapeResult;
    console.log(`✅ Hybrid scraper completed for ${source.source_name}:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Hybrid scraper error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articles_imported: 0 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});