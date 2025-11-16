import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const { topic_id: topicId } = await req.json();

    if (!topicId) {
      throw new Error('topic_id is required');
    }

    console.log(`🗑️ Clearing all sentiment keywords for topic ${topicId}`);

    const { error } = await supabase
      .from('sentiment_keyword_tracking')
      .delete()
      .eq('topic_id', topicId);

    if (error) {
      console.error('❌ Error clearing keywords:', error);
      throw error;
    }

    console.log('✅ All keywords cleared successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Keywords cleared' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
