import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { sourceId, topicId } = await req.json();

    console.log('Reactivating source:', sourceId);

    // Reactivate the source
    const { error: updateError } = await supabase
      .from('content_sources')
      .update({ 
        is_active: true, 
        consecutive_failures: 0,
        updated_at: new Date().toISOString() 
      })
      .eq('id', sourceId);

    if (updateError) throw updateError;

    console.log('Source reactivated, triggering test scrape...');

    // Get source details
    const { data: source, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError) throw sourceError;

    // Trigger universal-topic-scraper
    const scrapeResponse = await fetch(`${supabaseUrl}/functions/v1/universal-topic-scraper`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicId,
        sourceId,
        feedUrl: source.feed_url,
        forceRescrape: true
      })
    });

    const scrapeResult = await scrapeResponse.json();

    return new Response(JSON.stringify({
      success: true,
      source: {
        id: source.id,
        name: source.source_name,
        is_active: true
      },
      scrapeTest: scrapeResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
