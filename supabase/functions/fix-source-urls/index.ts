import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sourceId, fixes } = await req.json();
    
    // Single source fix mode
    if (sourceId && fixes) {
      const { data, error } = await supabase
        .from('content_sources')
        .update(fixes)
        .eq('id', sourceId)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, source: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch fix mode - fix known issues
    const results: any[] = [];

    // Fix 1: Towner Eastbourne - correct canonical domain
    const { data: towner, error: townerError } = await supabase
      .from('content_sources')
      .update({
        canonical_domain: 'townereastbourne.org.uk',
        scraping_method: 'universal-scraper',
        consecutive_failures: 0,
        is_active: true
      })
      .eq('source_name', 'Towner Eastbourne')
      .select()
      .single();

    if (townerError) {
      results.push({ source: 'Towner Eastbourne', success: false, error: townerError.message });
    } else {
      results.push({ source: 'Towner Eastbourne', success: true, data: towner });
    }

    // Fix 2: Eastbourne Herald - set to HTML scraping
    const { data: herald, error: heraldError } = await supabase
      .from('content_sources')
      .update({
        scraping_method: 'beautiful-soup-scraper',
        consecutive_failures: 0,
        is_active: true
      })
      .eq('source_name', 'Eastbourne Herald')
      .select()
      .single();

    if (heraldError) {
      results.push({ source: 'Eastbourne Herald', success: false, error: heraldError.message });
    } else {
      results.push({ source: 'Eastbourne Herald', success: true, data: herald });
    }

    // Also update topic_sources for Towner
    const { data: townerSource } = await supabase
      .from('content_sources')
      .select('id')
      .eq('source_name', 'Towner Eastbourne')
      .single();

    if (townerSource) {
      await supabase
        .from('topic_sources')
        .update({
          source_config: {
            feed_url: 'https://townereastbourne.org.uk/feed/'
          }
        })
        .eq('source_id', townerSource.id);
    }

    console.log('Source fixes applied:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Fix source URLs error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
