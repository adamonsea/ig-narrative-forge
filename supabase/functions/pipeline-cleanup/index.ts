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
      throw new Error('Missing required Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { topicIds, dryRun = true } = await req.json();

    console.log(`🧹 Starting pipeline cleanup for topics: ${topicIds}, dry run: ${dryRun}`);

    let processedCount = 0;
    let discardedCount = 0;
    const discardedArticles = [];

    // Get topics with their negative keywords and competing regions
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, negative_keywords, competing_regions')
      .in('id', topicIds);

    if (topicsError) {
      throw new Error(`Failed to fetch topics: ${topicsError.message}`);
    }

    for (const topic of topics) {
      console.log(`🔍 Processing topic: ${topic.name}`);
      console.log(`   Negative keywords: ${topic.negative_keywords || []}`);
      console.log(`   Competing regions: ${topic.competing_regions || []}`);

      // Get articles for this topic
      const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('id, title, body, processing_status, regional_relevance_score')
        .eq('topic_id', topic.id)
        .in('processing_status', ['new', 'processed']);

      if (articlesError) {
        console.error(`Failed to fetch articles for topic ${topic.name}:`, articlesError);
        continue;
      }

      console.log(`📄 Found ${articles.length} articles to check for topic ${topic.name}`);

      for (const article of articles) {
        processedCount++;
        let shouldDiscard = false;
        let discardReason = '';

        const titleLower = (article.title || '').toLowerCase();
        const bodyLower = (article.body || '').toLowerCase();
        const fullText = `${titleLower} ${bodyLower}`;

        // Check negative keywords
        if (topic.negative_keywords && topic.negative_keywords.length > 0) {
          for (const negativeKeyword of topic.negative_keywords) {
            if (fullText.includes(negativeKeyword.toLowerCase())) {
              shouldDiscard = true;
              discardReason = `Contains negative keyword: ${negativeKeyword}`;
              break;
            }
          }
        }

        // Check competing regions
        if (!shouldDiscard && topic.competing_regions && topic.competing_regions.length > 0) {
          for (const competingRegion of topic.competing_regions) {
            if (fullText.includes(competingRegion.toLowerCase())) {
              shouldDiscard = true;
              discardReason = `Mentions competing region: ${competingRegion}`;
              break;
            }
          }
        }

        // Also check for very low regional relevance scores
        if (!shouldDiscard && article.regional_relevance_score < 10) {
          shouldDiscard = true;
          discardReason = `Very low regional relevance score: ${article.regional_relevance_score}`;
        }

        if (shouldDiscard) {
          discardedCount++;
          const discardedInfo = {
            id: article.id,
            title: article.title,
            topic: topic.name,
            reason: discardReason,
            relevance_score: article.regional_relevance_score,
            current_status: article.processing_status
          };
          
          discardedArticles.push(discardedInfo);
          console.log(`❌ DISCARD: ${article.title} - ${discardReason}`);

          if (!dryRun) {
            // Update article status to discarded
            const { error: updateError } = await supabase
              .from('articles')
              .update({ 
                processing_status: 'discarded',
                import_metadata: {
                  ...article.import_metadata,
                  discard_reason: discardReason,
                  discarded_by: 'pipeline_cleanup',
                  discarded_at: new Date().toISOString()
                }
              })
              .eq('id', article.id);

            if (updateError) {
              console.error(`Failed to discard article ${article.id}:`, updateError);
            }
          }
        }
      }
    }

    const summary = {
      success: true,
      dry_run: dryRun,
      processed_articles: processedCount,
      discarded_articles: discardedCount,
      topics_processed: topics.map(t => t.name),
      discarded_list: discardedArticles
    };

    console.log(`✅ Pipeline cleanup complete:`);
    console.log(`   Processed: ${processedCount} articles`);
    console.log(`   Discarded: ${discardedCount} articles`);
    console.log(`   Dry run: ${dryRun}`);

    return new Response(
      JSON.stringify(summary),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in pipeline cleanup:', error);
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