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

    console.log('🔄 Starting backfill of discarded articles...');

    // Get all discarded topic_articles with their shared content
    const { data: discardedArticles, error: fetchError } = await supabase
      .from('topic_articles')
      .select(`
        id,
        topic_id,
        shared_content_id,
        processing_status,
        updated_at,
        shared_article_content!inner(
          url,
          normalized_url,
          title
        )
      `)
      .eq('processing_status', 'discarded');

    if (fetchError) {
      throw new Error(`Failed to fetch discarded articles: ${fetchError.message}`);
    }

    console.log(`📊 Found ${discardedArticles?.length || 0} discarded articles to backfill`);

    let backfilledCount = 0;
    let skippedCount = 0;

    for (const article of discardedArticles || []) {
      const sharedContent = article.shared_article_content;
      
      try {
        // Insert into discarded_articles (ON CONFLICT DO NOTHING to avoid duplicates)
        const { error: insertError } = await supabase
          .from('discarded_articles')
          .insert({
            topic_id: article.topic_id,
            url: sharedContent.url,
            normalized_url: sharedContent.normalized_url,
            title: sharedContent.title,
            discarded_reason: 'backfill_migration',
            discarded_at: article.updated_at
          });

        if (insertError) {
          if (insertError.code === '23505') { // Unique violation - already exists
            skippedCount++;
            console.log(`⏭️ Skipped duplicate: ${sharedContent.title}`);
          } else {
            throw insertError;
          }
        } else {
          backfilledCount++;
          console.log(`✅ Backfilled: ${sharedContent.title}`);
        }
      } catch (error) {
        console.error(`❌ Error backfilling article ${article.id}:`, error);
      }
    }

    // Log the backfill operation
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: 'Backfilled discarded articles for permanent suppression',
        context: {
          total_discarded: discardedArticles?.length || 0,
          backfilled_count: backfilledCount,
          skipped_count: skippedCount,
          operation: 'one_time_backfill'
        },
        function_name: 'backfill-discarded-articles'
      });

    console.log('✅ Backfill completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Backfill completed: ${backfilledCount} new entries, ${skippedCount} skipped (duplicates)`,
        stats: {
          total_discarded: discardedArticles?.length || 0,
          backfilled_count: backfilledCount,
          skipped_count: skippedCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in backfill-discarded-articles function:', error);
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