import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
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

    console.log(`🧠 Hybrid scraper starting - delegating to intelligent scraper`);
    console.log(`🎯 Target: ${sourceId} - ${feedUrl}`);

    // Delegate to intelligent scraper for optimal method selection and execution
    const intelligentResult = await supabase.functions.invoke('intelligent-scraper', {
      body: { 
        feedUrl, 
        sourceId, 
        region: region || 'General',
        topicId 
      }
    });

    if (intelligentResult.error) {
      console.error('❌ Intelligent scraper failed:', intelligentResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Intelligent scraper failed: ${intelligentResult.error?.message || 'Unknown error'}`,
          articles_imported: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeResult = intelligentResult;

    const result = scrapeResult.data || scrapeResult;
    console.log(`✅ Hybrid scraper completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Hybrid scraper error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        articles_imported: 0 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});