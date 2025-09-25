import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Deactivate sources with 0% success rate and at least 3 scrape attempts
    const { data: failingSources, error: queryError } = await supabase
      .from('content_sources')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('success_rate', 0)
      .gte('articles_scraped', 3)
      .eq('is_active', true)
      .select('id, source_name, canonical_domain');

    if (queryError) {
      throw queryError;
    }

    const deactivatedCount = failingSources?.length || 0;
    
    // Log the deactivation
    if (deactivatedCount > 0) {
      console.log(`🚫 Auto-deactivated ${deactivatedCount} consistently failing sources:`, 
        failingSources.map(s => s.source_name).join(', '));
        
      await supabase.from('system_logs').insert({
        level: 'info',
        message: `Auto-deactivated ${deactivatedCount} consistently failing sources`,
        context: { 
          deactivated_sources: failingSources,
          criteria: { success_rate: 0, min_attempts: 3 }
        },
        function_name: 'auto-deactivate-failing-sources'
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        deactivated_count: deactivatedCount,
        deactivated_sources: failingSources
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error auto-deactivating failing sources:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});