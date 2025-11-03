import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🗑️ Delete story animation request received');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { storyId } = await req.json();

    if (!storyId) {
      return new Response(
        JSON.stringify({ error: 'Missing storyId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📖 Story ID: ${storyId}`);

    // Fetch the story to get the animated_illustration_url
    const { data: story, error: fetchError } = await supabase
      .from('stories')
      .select('animated_illustration_url')
      .eq('id', storyId)
      .single();

    if (fetchError || !story) {
      console.error('❌ Story not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If there's an animated illustration, delete it from storage
    if (story.animated_illustration_url) {
      try {
        // Extract the file path from the URL
        const url = new URL(story.animated_illustration_url);
        const pathParts = url.pathname.split('/story-illustrations/');
        
        if (pathParts.length > 1) {
          const filePath = pathParts[1];
          console.log(`🗑️ Deleting animation file: ${filePath}`);
          
          const { error: deleteError } = await supabase.storage
            .from('story-illustrations')
            .remove([filePath]);

          if (deleteError) {
            console.error('⚠️ Storage deletion error:', deleteError);
            // Continue anyway to update the database
          } else {
            console.log('✅ Animation file deleted from storage');
          }
        }
      } catch (urlError) {
        console.error('⚠️ URL parsing error:', urlError);
        // Continue anyway to update the database
      }
    }

    // Update the story record to remove only the animated_illustration_url
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        animated_illustration_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', storyId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update story', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Animation removed successfully (static image preserved)');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
