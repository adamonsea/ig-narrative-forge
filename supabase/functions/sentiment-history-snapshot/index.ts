import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { backfill = false, weeksToBackfill = 8 } = await req.json().catch(() => ({}));

    console.log('📸 Starting sentiment history snapshot', { backfill, weeksToBackfill });

    // Get current week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - daysToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);

    let snapshotCount = 0;
    let topicsProcessed = 0;

    if (backfill) {
      // Backfill mode: reconstruct historical data from articles
      console.log(`📊 Backfilling ${weeksToBackfill} weeks of sentiment history...`);
      
      // Get all active topics with sentiment tracking enabled
      const { data: topics, error: topicsError } = await supabase
        .from('topic_sentiment_settings')
        .select('topic_id')
        .eq('enabled', true);

      if (topicsError) throw topicsError;

      for (const { topic_id } of topics || []) {
        // Get all tracked keywords for this topic
        const { data: keywords, error: kwError } = await supabase
          .from('sentiment_keyword_tracking')
          .select('*')
          .eq('topic_id', topic_id)
          .eq('tracked_for_cards', true);

        if (kwError || !keywords?.length) continue;

        topicsProcessed++;

        // For each week going back
        for (let weekOffset = 0; weekOffset < weeksToBackfill; weekOffset++) {
          const weekStart = new Date(currentWeekStart);
          weekStart.setDate(weekStart.getDate() - (weekOffset * 7));
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);

          // Get articles for this topic in this week
          const { data: topicArticles, error: taError } = await supabase
            .from('topic_articles')
            .select('shared_content_id')
            .eq('topic_id', topic_id)
            .gte('created_at', weekStart.toISOString())
            .lt('created_at', weekEnd.toISOString());

          if (taError || !topicArticles?.length) continue;

          const sharedContentIds = topicArticles.map(ta => ta.shared_content_id);

          // Get article content to analyze keywords
          const { data: articles, error: artError } = await supabase
            .from('shared_article_content')
            .select('title, body')
            .in('id', sharedContentIds);

          if (artError || !articles?.length) continue;

          // Count keyword mentions in this week's articles
          for (const kw of keywords) {
            const keyword = kw.keyword_phrase.toLowerCase();
            let totalMentions = 0;
            let positiveMentions = 0;
            let negativeMentions = 0;
            let neutralMentions = 0;
            let sourceCount = 0;

            // Simple positive/negative word lists for sentiment approximation
            const positiveWords = ['success', 'great', 'good', 'excellent', 'positive', 'win', 'growth', 'improvement', 'benefit', 'progress', 'celebrate', 'achievement', 'award', 'best', 'happy'];
            const negativeWords = ['fail', 'bad', 'poor', 'negative', 'loss', 'decline', 'problem', 'issue', 'concern', 'crisis', 'worst', 'disaster', 'danger', 'warning', 'controversy'];

            for (const article of articles) {
              const content = `${article.title || ''} ${article.body || ''}`.toLowerCase();
              const keywordCount = (content.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
              
              if (keywordCount > 0) {
                totalMentions += keywordCount;
                sourceCount++;

                // Simple sentiment detection
                const positiveScore = positiveWords.filter(w => content.includes(w)).length;
                const negativeScore = negativeWords.filter(w => content.includes(w)).length;

                if (positiveScore > negativeScore) {
                  positiveMentions += keywordCount;
                } else if (negativeScore > positiveScore) {
                  negativeMentions += keywordCount;
                } else {
                  neutralMentions += keywordCount;
                }
              }
            }

            if (totalMentions > 0) {
              const sentimentRatio = totalMentions > 0 
                ? (positiveMentions - negativeMentions) / totalMentions 
                : 0;

              // Upsert history record
              const { error: upsertError } = await supabase
                .from('sentiment_keyword_history')
                .upsert({
                  topic_id,
                  keyword_phrase: kw.keyword_phrase,
                  sentiment_direction: kw.sentiment_direction || (sentimentRatio > 0 ? 'positive' : sentimentRatio < 0 ? 'negative' : 'neutral'),
                  week_start_date: weekStart.toISOString().split('T')[0],
                  total_mentions: totalMentions,
                  positive_mentions: positiveMentions,
                  negative_mentions: negativeMentions,
                  neutral_mentions: neutralMentions,
                  sentiment_ratio: sentimentRatio,
                  source_count: sourceCount
                }, {
                  onConflict: 'topic_id,keyword_phrase,sentiment_direction,week_start_date'
                });

              if (!upsertError) {
                snapshotCount++;
              }
            }
          }
        }
      }
    } else {
      // Normal mode: snapshot current tracking data for this week
      console.log('📸 Creating weekly snapshot from current tracking data...');

      // Get all tracked keywords
      const { data: trackedKeywords, error: trackingError } = await supabase
        .from('sentiment_keyword_tracking')
        .select('*')
        .eq('tracked_for_cards', true);

      if (trackingError) throw trackingError;

      // Get unique topic IDs
      const topicIds = [...new Set((trackedKeywords || []).map(kw => kw.topic_id))];
      topicsProcessed = topicIds.length;

      // Insert snapshot records
      for (const kw of trackedKeywords || []) {
        const { error: insertError } = await supabase
          .from('sentiment_keyword_history')
          .upsert({
            topic_id: kw.topic_id,
            keyword_phrase: kw.keyword_phrase,
            sentiment_direction: kw.sentiment_direction || 'neutral',
            week_start_date: currentWeekStart.toISOString().split('T')[0],
            total_mentions: kw.total_mentions || 0,
            positive_mentions: kw.positive_mentions || 0,
            negative_mentions: kw.negative_mentions || 0,
            neutral_mentions: kw.neutral_mentions || 0,
            sentiment_ratio: kw.sentiment_ratio || 0,
            source_count: kw.source_count || 0
          }, {
            onConflict: 'topic_id,keyword_phrase,sentiment_direction,week_start_date'
          });

        if (!insertError) {
          snapshotCount++;
        }
      }
    }

    console.log(`✅ Sentiment history snapshot complete: ${snapshotCount} records for ${topicsProcessed} topics`);

    return new Response(
      JSON.stringify({
        success: true,
        snapshots_created: snapshotCount,
        topics_processed: topicsProcessed,
        week_start: currentWeekStart.toISOString().split('T')[0],
        mode: backfill ? 'backfill' : 'weekly'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error in sentiment-history-snapshot:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
