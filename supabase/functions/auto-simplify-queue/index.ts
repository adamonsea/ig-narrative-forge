import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TopicAutomationSettings {
  topic_id: string;
  automation_mode: string;
  auto_simplify_enabled: boolean;
  quality_threshold: number;
}

interface TopicArticle {
  id: string;
  shared_content_id: string;
  content_quality_score: number;
  topic_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = new Date().toISOString();
    console.log(`🔄 Auto-simplify queue check started at: ${startTime}`);

    // 1. Fetch topics with auto-simplify enabled
    const { data: topicSettings, error: settingsError } = await supabase
      .from('topic_automation_settings')
      .select('topic_id, automation_mode, auto_simplify_enabled, quality_threshold')
      .or('automation_mode.eq.auto_simplify,auto_simplify_enabled.eq.true');

    if (settingsError) {
      console.error('❌ Error fetching topic settings:', settingsError);
      throw settingsError;
    }

    if (!topicSettings || topicSettings.length === 0) {
      console.log('✨ No topics with auto-simplify enabled');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No topics with auto-simplify enabled',
          queued: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${topicSettings.length} topics with auto-simplify enabled`);

    let totalQueued = 0;
    const maxPerTopic = 20; // Safety cap

    // 2. For each topic, find qualifying articles
    for (const settings of topicSettings as TopicAutomationSettings[]) {
      const { topic_id, quality_threshold } = settings;
      
      console.log(`\n🔍 Processing topic: ${topic_id} (threshold: ${quality_threshold}%)`);

      // Fetch articles that are new and above threshold
      const { data: articles, error: articlesError } = await supabase
        .from('topic_articles')
        .select('id, shared_content_id, content_quality_score, topic_id')
        .eq('topic_id', topic_id)
        .eq('processing_status', 'new')
        .gte('content_quality_score', quality_threshold)
        .order('content_quality_score', { ascending: false })
        .limit(maxPerTopic);

      // 3. For qualifying articles, fetch source_urls in batch and find corresponding article_ids
      if (!articles || articles.length === 0) {
        console.log(`  ✨ No qualifying articles for topic ${topic_id}`);
        continue;
      }

      console.log(`  📄 Found ${articles.length} qualifying articles`);

      // Get all shared_content_ids to fetch source_urls in one query
      const sharedContentIds = articles.map((a: TopicArticle) => a.shared_content_id);
      
      const { data: sharedContent, error: contentError } = await supabase
        .from('shared_article_content')
        .select('id, url')
        .in('id', sharedContentIds);

      if (contentError) {
        console.error(`❌ Error fetching shared content for topic ${topic_id}:`, contentError);
        continue;
      }

      // Create a map of shared_content_id -> url
      const contentMap = new Map(sharedContent?.map(c => [c.id, c.url]) || []);

      // Get all URLs to find corresponding articles
      const sourceUrls = Array.from(contentMap.values());
      
      const { data: legacyArticles, error: legacyError } = await supabase
        .from('articles')
        .select('id, source_url')
        .in('source_url', sourceUrls);

      if (legacyError) {
        console.error(`❌ Error fetching legacy articles for topic ${topic_id}:`, legacyError);
        continue;
      }

      // Create a map of source_url -> article_id
      const articleMap = new Map(legacyArticles?.map(a => [a.source_url, a.id]) || []);

      // 4. Check for duplicates and queue
      for (const article of articles as TopicArticle[]) {
        const sourceUrl = contentMap.get(article.shared_content_id);
        if (!sourceUrl) {
          console.log(`  ⏭️  Skipping article ${article.id}: no URL found`);
          continue;
        }

        const articleId = articleMap.get(sourceUrl);
        if (!articleId) {
          console.log(`  ⏭️  Skipping article ${article.id}: no articles entry`);
          continue;
        }

        // Check if already queued (by topic_article_id)
        const { data: existingQueue, error: queueCheckError } = await supabase
          .from('content_generation_queue')
          .select('id')
          .eq('topic_article_id', article.id)
          .maybeSingle();

        if (queueCheckError && queueCheckError.code !== 'PGRST116') {
          console.error(`  ❌ Error checking queue for article ${article.id}:`, queueCheckError);
          continue;
        }

        if (existingQueue) {
          console.log(`  ⏭️  Skipping article ${article.id}: already queued`);
          continue;
        }

        // Check if story already exists for this article
        const { data: existingStory, error: storyCheckError } = await supabase
          .from('stories')
          .select('id')
          .eq('article_id', articleId)
          .maybeSingle();

        if (storyCheckError && storyCheckError.code !== 'PGRST116') {
          console.error(`  ❌ Error checking stories for article ${article.id}:`, storyCheckError);
          continue;
        }

        if (existingStory) {
          console.log(`  ⏭️  Skipping article ${article.id}: story already exists`);
          continue;
        }

        // 4. Insert into queue with all required IDs
        const { error: insertError } = await supabase
          .from('content_generation_queue')
          .insert({
            article_id: articleId, // Required: references articles table
            topic_article_id: article.id,
            shared_content_id: article.shared_content_id,
            status: 'pending',
            created_at: new Date().toISOString(),
            attempts: 0,
            max_attempts: 3,
          });

        if (insertError) {
          console.error(`  ❌ Error queueing article ${article.id}:`, insertError);
          continue;
        }

        console.log(`  ✅ Queued article ${article.id} (score: ${article.content_quality_score}%)`);
        totalQueued++;
      }
    }

    // 5. Log summary
    console.log(`\n📊 Auto-simplify queue summary: ${totalQueued} articles queued`);

    await supabase.from('system_logs').insert({
      event_type: 'auto_simplify_queue',
      severity: 'info',
      message: `Auto-simplify queue check completed`,
      metadata: {
        timestamp: startTime,
        topics_checked: topicSettings.length,
        total_queued: totalQueued,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        topics_checked: topicSettings.length,
        queued: totalQueued,
        timestamp: startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Auto-simplify queue error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
