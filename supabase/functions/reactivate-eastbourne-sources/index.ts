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

    console.log('🔄 Reactivating Eastbourne sources...');

    // Find the Eastbourne sources
    const { data: sources, error: findError } = await supabase
      .from('content_sources')
      .select('id, source_name, is_active')
      .in('source_name', ['bournefreelive.co.uk', 'eastbourne.news', 'sussex.press']);

    if (findError) throw findError;

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No Eastbourne sources found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${sources.length} Eastbourne sources:`, sources.map(s => s.source_name));

    // Reactivate them
    const sourceIds = sources.map(s => s.id);
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

    if (error) throw error;

    console.log(`✅ Successfully reactivated ${data?.length || 0} sources`);

    // Log to audit
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Eastbourne sources reactivated via reactivate-eastbourne-sources',
      context: {
        sources_reactivated: data?.map(s => s.source_name),
        fix_type: 'manual_reactivation',
        reason: 'Sources incorrectly deactivated, causing Eastbourne feed issues'
      },
      function_name: 'reactivate-eastbourne-sources'
    });

    return new Response(
      JSON.stringify({
        success: true,
        sources_reactivated: data?.length || 0,
        sources: data
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error reactivating Eastbourne sources:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
