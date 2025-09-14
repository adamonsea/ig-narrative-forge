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

    console.log('🧹 Starting automated duplicate cleanup...');

    // Clean up articles older than 1 week from Arrivals
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Clean old articles based on published_at OR created_at
    const { error: oldArticlesError, count: oldArticlesCount } = await supabase
      .from('topic_articles')
      .update({ processing_status: 'discarded' })
      .eq('processing_status', 'new')
      .or(`created_at.lt.${oneWeekAgo},shared_article_content.published_at.lt.${oneWeekAgo}`)
      .select('*, shared_article_content!inner(published_at)', { count: 'exact' });

    if (oldArticlesError) {
      console.error('❌ Error cleaning old articles:', oldArticlesError);
    }

    // Clean up multi-tenant duplicates (already published items from Arrivals)
    const { data: publishedStories } = await supabase
      .from('stories')
      .select('topic_article_id, shared_content_id, article_id')
      .eq('is_published', true)
      .not('topic_article_id', 'is', null);

    const publishedTopicArticleIds = publishedStories?.map(s => s.topic_article_id).filter(Boolean) || [];
    const publishedSharedContentIds = publishedStories?.map(s => s.shared_content_id).filter(Boolean) || [];

    let cleanedArrivals = 0;
    if (publishedTopicArticleIds.length > 0) {
      // Remove published articles from Arrivals queue
      const { error: arrivalCleanupError, count } = await supabase
        .from('topic_articles')
        .update({ processing_status: 'discarded' })
        .eq('processing_status', 'new')
        .in('id', publishedTopicArticleIds);

      if (!arrivalCleanupError && count) {
        cleanedArrivals = count;
      }
    }

    // Run legacy duplicate cleanup
    const { data: legacyCleanupResult, error: legacyError } = await supabase
      .rpc('cleanup_existing_duplicates');

    if (legacyError) {
      console.error('❌ Legacy cleanup error:', legacyError);
    }

    // Clean up discarded articles older than 30 days to free up space
    const { error: discardedCleanupError, count: discardedCount } = await supabase
      .from('topic_articles')
      .delete()
      .eq('processing_status', 'discarded')
      .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const result = {
      success: true,
      old_articles_cleaned: oldArticlesCount || 0,
      cleaned_arrivals: cleanedArrivals,
      legacy_cleanup: legacyCleanupResult || { articles_processed: 0 },
      discarded_cleaned: discardedCount || 0,
      message: `Automated cleanup: ${oldArticlesCount || 0} old articles, ${cleanedArrivals} arrivals, ${legacyCleanupResult?.articles_processed || 0} legacy duplicates, ${discardedCount || 0} old discarded records`
    };

    console.log('✅ Automated cleanup completed:', result);

    // Log to system
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Automated duplicate cleanup completed',
        context: result,
        function_name: 'auto-cleanup-duplicates'
      });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in auto-cleanup-duplicates:', error);
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