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
    const { topicId, triggerType = 'keyword_update' } = await req.json();

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'topicId is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🔄 Keyword rescan trigger started for topic: ${topicId}`);

    // Get topic information to determine scraper type
    const { data: topicInfo, error: topicError } = await supabase
      .from('topics')
      .select('topic_type, region')
      .eq('id', topicId)
      .single();

    if (topicError) {
      console.error('❌ Failed to fetch topic info:', topicError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch topic information' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Determine which scraper to use based on topic type
    const scraperFunction = topicInfo.topic_type === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
    console.log(`📍 Using ${scraperFunction} for ${topicInfo.topic_type} topic`);

    // Get all active sources for this topic
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('topic_id', topicId)
      .eq('is_active', true);

    if (sourcesError) {
      console.error('❌ Failed to fetch sources:', sourcesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch topic sources' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active sources found for topic',
          sourcesTriggered: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Trigger re-scraping for each source using appropriate scraper
    const triggerPromises = sources.map(async (source) => {
      try {
        // Create appropriate request body based on topic type
        const requestBody = topicInfo.topic_type === 'regional'
          ? {
              feedUrl: source.feed_url,
              sourceId: source.id,
              region: topicInfo.region || 'default'
            }
          : {
              feedUrl: source.feed_url,
              topicId: topicId,
              sourceId: source.id
            };

        const { data, error } = await supabase.functions.invoke(scraperFunction, {
          body: requestBody
        });

        if (error) {
          console.error(`❌ Re-scan failed for source ${source.source_name}:`, error);
          return { success: false, sourceId: source.id, error: error.message };
        }

        console.log(`✅ Re-scan successful for ${source.source_name}: ${data?.articlesStored || 0} articles`);
        return { 
          success: true, 
          sourceId: source.id, 
          sourceName: source.source_name,
          articlesStored: data?.articlesStored || 0 
        };
      } catch (error) {
        console.error(`❌ Re-scan error for source ${source.source_name}:`, error);
        return { success: false, sourceId: source.id, error: error.message };
      }
    });

    const results = await Promise.allSettled(triggerPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    // Log the trigger event
    const { error: logError } = await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Keyword rescan trigger completed`,
        context: {
          topicId,
          triggerType,
          topicType: topicInfo.topic_type,
          scraperUsed: scraperFunction,
          totalSources: sources.length,
          successful,
          failed,
          results: results.map(r => r.status === 'fulfilled' ? r.value : { error: 'Promise rejected' })
        },
        function_name: 'keyword-rescan-trigger'
      });

    if (logError) {
      console.warn('⚠️  Failed to log trigger event:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Rescan trigger completed: ${successful}/${sources.length} sources processed successfully`,
        sourcesTriggered: sources.length,
        successful,
        failed,
        topicId
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Keyword rescan trigger error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        message: 'Keyword rescan trigger failed'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});