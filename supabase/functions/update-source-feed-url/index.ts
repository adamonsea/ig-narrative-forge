import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { sourceId, newFeedUrl, scrapingMethod } = await req.json();

    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: 'sourceId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString()
    };
    
    if (newFeedUrl) {
      updates.feed_url = newFeedUrl;
    }
    
    if (scrapingMethod) {
      updates.scraping_method = scrapingMethod;
    }

    if (!newFeedUrl && !scrapingMethod) {
      return new Response(
        JSON.stringify({ error: 'Either newFeedUrl or scrapingMethod must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the source
    const { data, error } = await supabase
      .from('content_sources')
      .update(updates)
      .eq('id', sourceId)
      .select('id, source_name, feed_url, scraping_method, canonical_domain')
      .single();

    if (error) throw error;

    const updateMessages = [];
    if (newFeedUrl) updateMessages.push(`feed URL to ${newFeedUrl}`);
    if (scrapingMethod) updateMessages.push(`scraping method to ${scrapingMethod}`);
    
    console.log(`✅ Updated ${updateMessages.join(' and ')} for ${data.source_name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        source: data,
        message: `Updated ${updateMessages.join(' and ')} for ${data.source_name}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error updating source feed URL:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
