import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧪 Testing Full Processing Pipeline');

    // Process one pending queue item
    const { data, error } = await supabase.functions.invoke('queue-processor');

    if (error) {
      console.error('❌ Queue processor failed:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Queue processor failed',
          details: error 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Queue processor result:', data);

    // Check how many published stories we now have
    const { data: storyCount, error: countError } = await supabase.rpc('get_topic_stories', {
      p_topic_id: 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
    });

    if (countError) {
      console.error('❌ Failed to count stories:', countError);
    }

    console.log(`📊 Total published stories for Eastbourne: ${storyCount?.length || 0}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Processing pipeline tested successfully',
        queueResult: data,
        publishedStoriesCount: storyCount?.length || 0,
        pipeline_status: 'working'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Pipeline test failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        phase: 'Full Pipeline Test'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});