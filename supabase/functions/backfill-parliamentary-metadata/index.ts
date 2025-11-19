import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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

    console.log('🔄 Starting parliamentary metadata backfill...');

    // Get all parliamentary stories missing MP metadata
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title')
      .eq('is_parliamentary', true)
      .is('mp_name', null);

    if (storiesError) throw storiesError;

    console.log(`📊 Found ${stories?.length || 0} stories needing backfill`);

    let updated = 0;
    let failed = 0;

    for (const story of stories || []) {
      try {
        // Get MP data from parliamentary_mentions via the story
        const { data: mention, error: mentionError } = await supabase
          .from('parliamentary_mentions')
          .select('mp_name, party, constituency')
          .eq('story_id', story.id)
          .single();

        if (mentionError || !mention) {
          console.log(`⚠️ No parliamentary mention found for story ${story.id}`);
          failed++;
          continue;
        }

        // Update the story with MP metadata
        const { error: updateError } = await supabase
          .from('stories')
          .update({
            mp_name: mention.mp_name,
            mp_party: mention.party,
            constituency: mention.constituency
          })
          .eq('id', story.id);

        if (updateError) {
          console.error(`❌ Failed to update story ${story.id}:`, updateError);
          failed++;
        } else {
          console.log(`✅ Updated story: ${mention.mp_name} (${mention.party}) - ${story.title}`);
          updated++;
        }
      } catch (err) {
        console.error(`❌ Error processing story ${story.id}:`, err);
        failed++;
      }
    }

    console.log(`✅ Backfill complete: ${updated} updated, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        failed,
        total: stories?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Backfill error:', error);
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
