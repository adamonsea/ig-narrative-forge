import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🕐 Community Intelligence Scheduler starting...');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if any topics need community processing (every 24 hours)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const { data: topics } = await supabase
      .from('topics')
      .select('id, name, community_config, community_intelligence_enabled')
      .eq('community_intelligence_enabled', true)
      .or(`community_config->last_processed.is.null,community_config->last_processed.lt.${twentyFourHoursAgo.toISOString()}`);
    
    if (!topics || topics.length === 0) {
      console.log('✅ No topics need community processing yet');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No topics ready for processing',
          next_check: '24 hours'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`📊 Found ${topics.length} topics ready for community processing`);
    
    // Call the Reddit community processor
    const processorResponse = await supabase.functions.invoke('reddit-community-processor', {
      body: { scheduled: true, topics: topics.length }
    });
    
    if (processorResponse.error) {
      console.error('Error invoking reddit-community-processor:', processorResponse.error);
      throw new Error('Failed to invoke community processor');
    }
    
    console.log('✅ Community processing scheduled successfully');
    
    // Clean up expired insights (older than 7 days)
    await supabase.rpc('cleanup_expired_community_insights');
    
    return new Response(
      JSON.stringify({
        success: true,
        topics_scheduled: topics.length,
        processor_result: processorResponse.data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reddit-community-scheduler:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});