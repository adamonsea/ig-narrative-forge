import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📢 Converting ready stories to published status...');

    // Update all stories with status 'ready' to be published
    const { data: updatedStories, error: updateError } = await supabase
      .from('stories')
      .update({
        status: 'published',
        is_published: true
      })
      .eq('status', 'ready')
      .select('id, title');

    if (updateError) {
      console.error('Error updating ready stories:', updateError);
      throw new Error(`Failed to update stories: ${updateError.message}`);
    }

    const updatedCount = updatedStories?.length || 0;
    console.log(`✅ Successfully published ${updatedCount} ready stories`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Published ${updatedCount} ready stories`,
        updatedStories: updatedStories?.map(s => ({ id: s.id, title: s.title })) || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in publish-ready-stories function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});