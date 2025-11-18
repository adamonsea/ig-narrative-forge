import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { topicId } = await req.json();

    // Get sentiment cards to backfill (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    let query = supabase
      .from('sentiment_cards')
      .select('id, topic_id, keyword_phrase, sources, topics(slug)')
      .gte('analysis_date', fourteenDaysAgo.toISOString())
      .eq('card_category', 'detail');

    if (topicId) {
      query = query.eq('topic_id', topicId);
    }

    const { data: cards, error: cardsError } = await query;

    if (cardsError) throw cardsError;

    console.log(`Found ${cards?.length || 0} cards to backfill`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const card of cards || []) {
      try {
        const topicSlug = card.topics?.slug || 'feed';
        const sourcesList = Array.isArray(card.sources) ? card.sources : [];
        const enrichedSources = [];

        for (const source of sourcesList) {
          const sourceUrl = source.url;
          
          // Lookup article by source_url or canonical_url
          const { data: article } = await supabase
            .from('articles')
            .select('id, title, published_at, topic_id')
            .or(`source_url.eq.${sourceUrl},canonical_url.eq.${sourceUrl}`)
            .eq('topic_id', card.topic_id)
            .single();

          if (article) {
            // Try to find a published story for this article
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('id, story_id, stories(id, title)')
              .eq('article_id', article.id)
              .eq('topic_id', card.topic_id)
              .not('story_id', 'is', null)
              .single();

            if (topicArticle?.stories) {
              // Story exists - use internal card URL
              enrichedSources.push({
                url: sourceUrl,
                title: topicArticle.stories.title,
                date: article.published_at?.split('T')[0] || source.date,
                card_url: `/feed/${topicSlug}/story/${topicArticle.stories.id}`,
                story_id: topicArticle.stories.id
              });
            } else {
              // Article exists but no story yet
              enrichedSources.push({
                url: sourceUrl,
                title: article.title,
                date: article.published_at?.split('T')[0] || source.date,
                card_url: null
              });
            }
          } else {
            // No article found - use existing data or hostname
            const hostname = new URL(sourceUrl).hostname.replace('www.', '');
            enrichedSources.push({
              url: sourceUrl,
              title: source.title || hostname,
              date: source.date || new Date().toISOString().split('T')[0],
              card_url: null
            });
          }
        }

        // Update the card with enriched sources
        const { error: updateError } = await supabase
          .from('sentiment_cards')
          .update({ sources: enrichedSources })
          .eq('id', card.id);

        if (updateError) {
          console.error(`Error updating card ${card.id}:`, updateError);
          errorCount++;
        } else {
          updatedCount++;
          console.log(`Updated card ${card.id} with ${enrichedSources.length} enriched sources`);
        }
      } catch (err) {
        console.error(`Error processing card ${card.id}:`, err);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        cardsProcessed: cards?.length || 0,
        cardsUpdated: updatedCount,
        errors: errorCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error backfilling sentiment card sources:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
