import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { sourceIds } = await req.json();

    if (!sourceIds || !Array.isArray(sourceIds)) {
      return new Response(
        JSON.stringify({ error: 'sourceIds array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔄 Reactivating ${sourceIds.length} sources...`);

    const { data, error } = await supabase
      .from('content_sources')
      .update({
        is_active: true,
        consecutive_failures: 0,
        last_failure_reason: null,
        updated_at: new Date().toISOString()
      })
      .in('id', sourceIds)
      .select('id, source_name, is_active');

    if (error) {
      throw error;
    }

    console.log(`✅ Reactivated ${data?.length || 0} sources`);

    return new Response(
      JSON.stringify({
        success: true,
        reactivated: data?.length || 0,
        sources: data
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error reactivating sources:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
