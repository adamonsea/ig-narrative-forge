import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    const { topicId, userId } = await req.json();

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'topicId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build delete query
    let query = supabase
      .from('story_swipes')
      .delete()
      .eq('topic_id', topicId);

    // If userId provided, only delete that user's swipes
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error, count } = await query.select();

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Deleted ${data?.length || 0} swipes for topic`,
        deletedCount: data?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error resetting swipes:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
