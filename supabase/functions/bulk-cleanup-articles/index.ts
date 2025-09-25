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
    
    const { topicId, cleanupType = 'duplicates' } = await req.json();

    console.log('🧹 Starting bulk cleanup for topic:', topicId, 'type:', cleanupType);

    let cleanedCount = 0;
    let totalCount = 0;

    if (cleanupType === 'duplicates') {
      // Clean up likely duplicates based on title similarity and low relevance
      const { data: articles, error: fetchError } = await supabase
        .from('articles')
        .select('id, title, regional_relevance_score, word_count, created_at')
        .eq('topic_id', topicId)
        .in('processing_status', ['new'])
        .order('created_at', { ascending: true }); // Oldest first to keep newer ones

      if (fetchError) throw fetchError;

      totalCount = articles?.length || 0;
      console.log(`Found ${totalCount} articles to analyze for duplicates`);

      if (articles && articles.length > 0) {
        const articlesToDiscard = [];
        const seenTitles = new Set();

        for (const article of articles) {
          // Normalize title for comparison
          const normalizedTitle = article.title
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Check for duplicates or low-quality content
          const isDuplicate = seenTitles.has(normalizedTitle);
          const isLowQuality = (
            !article.regional_relevance_score || 
            article.regional_relevance_score < 15 ||
            !article.word_count ||
            article.word_count < 50
          );

          if (isDuplicate || isLowQuality) {
            articlesToDiscard.push(article.id);
          } else {
            seenTitles.add(normalizedTitle);
          }
        }

        if (articlesToDiscard.length > 0) {
          const { error: updateError } = await supabase
            .from('articles')
            .update({
              processing_status: 'discarded',
              import_metadata: {
                discarded_reason: 'Bulk cleanup - duplicates or low quality',
                cleanup_at: new Date().toISOString(),
                cleanup_function: 'bulk-cleanup-articles',
                cleanup_type: cleanupType
              }
            })
            .in('id', articlesToDiscard);

          if (updateError) throw updateError;
          cleanedCount = articlesToDiscard.length;
        }
      }
    } else if (cleanupType === 'old_low_relevance') {
      // Clean up old articles with very low relevance scores
      const { error: updateError, count } = await supabase
        .from('articles')
        .update({
          processing_status: 'discarded',
          import_metadata: {
            discarded_reason: 'Bulk cleanup - old low relevance articles',
            cleanup_at: new Date().toISOString(),
            cleanup_function: 'bulk-cleanup-articles',
            cleanup_type: cleanupType
          }
        })
        .eq('topic_id', topicId)
        .in('processing_status', ['new'])
        .lt('created_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()) // Older than 5 days
        .or('regional_relevance_score.lt.10,regional_relevance_score.is.null')
        .select('*');

      if (updateError) throw updateError;
      cleanedCount = count || 0;
    }

    console.log(`✅ Cleanup completed. Processed ${cleanedCount} articles out of ${totalCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        cleaned: cleanedCount,
        total: totalCount,
        message: `Successfully cleaned up ${cleanedCount} articles using ${cleanupType} cleanup`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in bulk-cleanup-articles function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});