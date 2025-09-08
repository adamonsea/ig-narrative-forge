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
    const { action } = await req.json();

    if (action === 'fix_method_assignment') {
      console.log('🔧 Emergency fix: Updating method assignment for RSS-capable sources...');
      
      // Get sources that should use RSS method but are currently using HTML
      const { data: sources, error: sourcesError } = await supabase
        .from('content_sources')
        .select('id, source_name, feed_url, scraping_method')
        .or('feed_url.like.%rss%,feed_url.like.%feed%,feed_url.like.%xml%')
        .neq('scraping_method', 'universal-scraper');

      if (sourcesError) {
        throw sourcesError;
      }

      console.log(`Found ${sources?.length || 0} sources to fix method assignment`);

      let fixedCount = 0;
      for (const source of sources || []) {
        // Update to use universal-scraper for RSS feeds
        const { error: updateError } = await supabase
          .from('content_sources')
          .update({ 
            scraping_method: 'universal-scraper',
            updated_at: new Date().toISOString()
          })
          .eq('id', source.id);

        if (!updateError) {
          console.log(`✅ Fixed method assignment for ${source.source_name}: ${source.feed_url}`);
          fixedCount++;
        } else {
          console.error(`❌ Failed to fix ${source.source_name}:`, updateError);
        }
      }

      // Log the recovery action
      await supabase
        .from('system_logs')
        .insert({
          level: 'info',
          message: `Emergency method assignment fix completed: ${fixedCount} sources updated`,
          context: {
            action: 'emergency_method_fix',
            sources_fixed: fixedCount,
            timestamp: new Date().toISOString()
          },
          function_name: 'emergency-source-fix'
        });

      return new Response(
        JSON.stringify({ 
          success: true, 
          sources_fixed: fixedCount,
          message: `Updated method assignment for ${fixedCount} sources`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'trigger_emergency_scraping') {
      console.log('🚀 Emergency scraping: Testing fixed RSS feeds...');
      
      // Get the BBC sources we just fixed
      const { data: bbcSources, error: bbcError } = await supabase
        .from('content_sources')
        .select('id, source_name, feed_url')
        .or('feed_url.like.%bbci.co.uk%,source_name.ilike.%bbc%')
        .eq('is_active', true);

      if (bbcError) {
        throw bbcError;
      }

      console.log(`Found ${bbcSources?.length || 0} BBC sources to test`);

      let testedCount = 0;
      const results = [];

      for (const source of bbcSources || []) {
        try {
          // Test the RSS feed directly
          const response = await fetch(source.feed_url, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews/1.0; +https://eezee.news)'
            }
          });

          const result = {
            source_name: source.source_name,
            feed_url: source.feed_url,
            status: response.status,
            success: response.ok
          };

          results.push(result);
          
          if (response.ok) {
            console.log(`✅ RSS feed working: ${source.source_name} - ${source.feed_url}`);
          } else {
            console.log(`❌ RSS feed failed: ${source.source_name} - ${source.feed_url} (Status: ${response.status})`);
          }

          testedCount++;
        } catch (error) {
          console.error(`❌ Error testing ${source.source_name}:`, error.message);
          results.push({
            source_name: source.source_name,
            feed_url: source.feed_url,
            status: 0,
            success: false,
            error: error.message
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          tested_count: testedCount,
          results: results,
          message: `Tested ${testedCount} RSS feeds`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('💥 Emergency source fix error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});