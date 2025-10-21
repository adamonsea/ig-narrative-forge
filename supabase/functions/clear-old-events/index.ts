import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId } = await req.json();

    if (!topicId) {
      throw new Error('Topic ID is required');
    }

    console.log(`🗑️ Clearing old/outdated events for topic: ${topicId}`);

    // Delete events with old dates (before today) or invalid dates
    const { data: deletedEvents, error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('topic_id', topicId)
      .or('start_date.lt.today(),start_date.is.null');

    if (deleteError) {
      console.error('❌ Error deleting old events:', deleteError);
      throw deleteError;
    }

    // Also delete any events from 2023 (legacy AI events)
    const { error: legacyDeleteError } = await supabase
      .from('events')
      .delete()
      .eq('topic_id', topicId)
      .like('start_date', '2023%');

    if (legacyDeleteError) {
      console.error('❌ Error deleting legacy events:', legacyDeleteError);
    }

    console.log(`✅ Successfully cleared old events for topic: ${topicId}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Old events cleared successfully',
      topicId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error clearing old events:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});