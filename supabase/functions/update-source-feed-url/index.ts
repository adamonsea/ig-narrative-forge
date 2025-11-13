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

    const { sourceId, newFeedUrl } = await req.json();

    if (!sourceId || !newFeedUrl) {
      return new Response(
        JSON.stringify({ error: 'sourceId and newFeedUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the feed URL
    const { data, error } = await supabase
      .from('content_sources')
      .update({ 
        feed_url: newFeedUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId)
      .select('id, source_name, feed_url, canonical_domain')
      .single();

    if (error) throw error;

    console.log(`✅ Updated feed URL for ${data.source_name} to ${newFeedUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        source: data,
        message: `Feed URL updated successfully for ${data.source_name}`
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
