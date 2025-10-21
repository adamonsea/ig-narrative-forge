import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { topic_id } = await req.json();

    if (!topic_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🧹 Cleaning up invalid parliamentary mentions for topic: ${topic_id}`);

    // Fetch tracked MPs for this topic
    const { data: trackedMPs, error: trackedError } = await supabase
      .from('topic_tracked_mps')
      .select('mp_id, mp_name, constituency')
      .eq('topic_id', topic_id);

    if (trackedError) {
      throw new Error(`Failed to fetch tracked MPs: ${trackedError.message}`);
    }

    console.log(`📋 Found ${trackedMPs?.length || 0} tracked MPs`);

    // Create normalized sets for validation
    const trackedByMpId = new Set(trackedMPs?.map(t => t.mp_id) || []);
    const trackedByNameConstituency = new Set(
      trackedMPs?.map(t => {
        const normalizedName = t.mp_name.toLowerCase().replace(/^(mr|ms|mrs|dr|rt hon)\\.?\s+/i, '').trim();
        const normalizedConstituency = (t.constituency || '').toLowerCase().trim();
        return `${normalizedName}|${normalizedConstituency}`;
      }) || []
    );

    // Find all parliamentary mentions for this topic
    const { data: mentions, error: mentionsError } = await supabase
      .from('parliamentary_mentions')
      .select('id, story_id, mp_name, constituency, import_metadata')
      .eq('topic_id', topic_id)
      .eq('mention_type', 'vote');

    if (mentionsError) {
      throw new Error(`Failed to fetch mentions: ${mentionsError.message}`);
    }

    console.log(`🔍 Found ${mentions?.length || 0} total parliamentary mentions`);

    let invalidCount = 0;
    let storiesDeleted = 0;
    let mentionsDeleted = 0;

    // Process each mention
    for (const mention of mentions || []) {
      const mpId = mention.import_metadata?.mp_id;
      const normalizedName = mention.mp_name.toLowerCase().replace(/^(mr|ms|mrs|dr|rt hon)\\.?\s+/i, '').trim();
      const normalizedConstituency = (mention.constituency || '').toLowerCase().trim();
      const key = `${normalizedName}|${normalizedConstituency}`;

      // Check if this mention is for a tracked MP
      const isTracked = (mpId && trackedByMpId.has(mpId)) || trackedByNameConstituency.has(key);

      if (!isTracked) {
        invalidCount++;
        console.log(`❌ Invalid mention found: ${mention.mp_name} (${mention.constituency})`);

        // Delete associated story if it exists
        if (mention.story_id) {
          console.log(`🗑️ Deleting story: ${mention.story_id}`);
          
          const { data: deleteResult, error: deleteError } = await supabase.functions.invoke(
            'delete-story-cascade',
            {
              body: { story_id: mention.story_id }
            }
          );

          if (deleteError) {
            console.error(`Failed to delete story ${mention.story_id}:`, deleteError);
          } else if (deleteResult?.success) {
            storiesDeleted++;
            console.log(`✅ Story deleted successfully`);
          }
        }

        // Delete the mention
        const { error: deleteMentionError } = await supabase
          .from('parliamentary_mentions')
          .delete()
          .eq('id', mention.id);

        if (deleteMentionError) {
          console.error(`Failed to delete mention ${mention.id}:`, deleteMentionError);
        } else {
          mentionsDeleted++;
        }
      }
    }

    console.log(`✅ Cleanup complete`);
    console.log(`   - Invalid mentions found: ${invalidCount}`);
    console.log(`   - Stories deleted: ${storiesDeleted}`);
    console.log(`   - Mentions deleted: ${mentionsDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        topic_id,
        invalid_mentions: invalidCount,
        stories_deleted: storiesDeleted,
        mentions_deleted: mentionsDeleted
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
