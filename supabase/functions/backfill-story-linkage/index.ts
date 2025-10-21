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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔄 Starting story linkage backfill...');

    // Find stories that need multi-tenant linkage
    const { data: storiesNeedingLinkage, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        article_id,
        topic_article_id,
        shared_content_id,
        articles!inner(import_metadata, topic_id)
      `)
      .is('topic_article_id', null)
      .not('articles.import_metadata', 'is', null);

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    console.log(`📊 Found ${storiesNeedingLinkage?.length || 0} stories that may need linkage`);

    let updatedCount = 0;
    const updates = [];

    for (const story of storiesNeedingLinkage || []) {
      const importMetadata = story.articles?.[0]?.import_metadata || {};
      
      // Check if this is a multi-tenant bridge article
      if (importMetadata.multi_tenant_bridge && 
          importMetadata.topic_article_id && 
          importMetadata.shared_content_id) {
        
        console.log(`🔗 Updating story ${story.id} with multi-tenant linkage`);
        
        const { error: updateError } = await supabase
          .from('stories')
          .update({
            topic_article_id: importMetadata.topic_article_id,
            shared_content_id: importMetadata.shared_content_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', story.id);

        if (updateError) {
          console.error(`❌ Failed to update story ${story.id}:`, updateError);
          updates.push({
            storyId: story.id,
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`✅ Successfully updated story ${story.id}`);
          updatedCount++;
          updates.push({
            storyId: story.id,
            success: true,
            topicArticleId: importMetadata.topic_article_id,
            sharedContentId: importMetadata.shared_content_id
          });
        }
      }
    }

    console.log(`🏁 Backfill complete. Updated ${updatedCount} stories.`);

    return new Response(JSON.stringify({
      success: true,
      processed: storiesNeedingLinkage?.length || 0,
      updated: updatedCount,
      updates: updates
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Backfill error:', error);
    
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