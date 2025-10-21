import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find sources that have good performance but stale errors
    const { data: staleSources, error: queryError } = await supabase
      .from('content_sources')
      .select(`
        id, 
        source_name, 
        feed_url, 
        success_rate, 
        articles_scraped, 
        last_scraped_at
      `)
      .gte('success_rate', 70) // Good success rate
      .gte('articles_scraped', 5) // Some activity
      .gte('last_scraped_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Active in last 7 days

    if (queryError) throw queryError;

    let cleanedCount = 0;

    // Clear stale errors for these performing sources
    for (const source of staleSources || []) {
      const { error: updateError } = await supabase
        .from('scraping_automation')
        .update({ 
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('source_url', source.feed_url)
        .not('last_error', 'is', null);

      if (!updateError) {
        cleanedCount++;
      }
    }

    // Log the cleanup
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Cleaned stale source errors',
      context: {
        sources_processed: staleSources?.length || 0,
        errors_cleared: cleanedCount,
        cleanup_criteria: 'success_rate >= 70%, articles_scraped >= 5, active within 7 days'
      },
      function_name: 'cleanup-stale-source-errors'
    });

    return new Response(
      JSON.stringify({
        success: true,
        sources_processed: staleSources?.length || 0,
        errors_cleared: cleanedCount,
        message: `Cleared stale errors for ${cleanedCount} performing sources`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error cleaning stale source errors:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clean stale source errors'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});