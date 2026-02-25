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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = new Date().toISOString();
    console.log(`🔄 Auto-simplify queue check started at: ${startTime}`);

    // 1. Fetch topics with auto-simplify enabled (including holiday mode)
    const { data: topicSettings, error: settingsError } = await supabase
      .from('topic_automation_settings')
      .select('topic_id, automation_mode, auto_simplify_enabled, quality_threshold')
      .in('automation_mode', ['auto_simplify', 'holiday']);

    if (settingsError) {
      console.error('❌ Error fetching topic settings:', settingsError);
      throw settingsError;
    }

    if (!topicSettings || topicSettings.length === 0) {
      console.log('✨ No topics with auto-simplify enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No topics with auto-simplify enabled', queued: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${topicSettings.length} topics with auto-simplify enabled`);

    // 1b. Orphan recovery: reset 'processed' articles back to 'new' if they have no story and no active queue item
    const topicIdsForRecovery = topicSettings.map((s: TopicAutomationSettings) => s.topic_id);
    for (const tid of topicIdsForRecovery) {
      const { data: orphans } = await supabase
        .from('topic_articles')
        .select('id, import_metadata')
        .eq('topic_id', tid)
        .eq('processing_status', 'processed');

      if (orphans && orphans.length > 0) {
        for (const orphan of orphans) {
          // Skip parliamentary articles — they have their own pipeline
          const meta = orphan.import_metadata as Record<string, unknown> | null;
          if (meta?.source === 'parliamentary_vote' || meta?.source === 'parliamentary_weekly_roundup') {
            continue;
          }

          // Check if a story exists for this topic_article
          const { data: existingStory } = await supabase
            .from('stories')
            .select('id')
            .eq('topic_article_id', orphan.id)
            .maybeSingle();
          if (existingStory) continue;

          // Check if an active queue item exists
          const { data: activeQueue } = await supabase
            .from('content_generation_queue')
            .select('id')
            .eq('topic_article_id', orphan.id)
            .in('status', ['pending', 'processing'])
            .maybeSingle();
          if (activeQueue) continue;

          // Orphan: no story, no active queue item — reset to 'new'
          console.log(`🔁 Resetting orphaned article ${orphan.id} from 'processed' to 'new'`);
          await supabase
            .from('topic_articles')
            .update({ processing_status: 'new' })
            .eq('id', orphan.id);
        }
      }
    }

    let totalQueued = 0;
    const maxPerTopic = 20;
    const topicsWithNewItems: string[] = [];

    // 2. Pre-fetch topic voice defaults for all topics
    const topicIds = topicSettings.map((s: TopicAutomationSettings) => s.topic_id);
    const { data: topicDefaults } = await supabase
      .from('topics')
      .select('id, default_tone, default_writing_style, audience_expertise')
      .in('id', topicIds);
    
    const topicDefaultsMap: Record<string, { tone?: string; writing_style?: string; audience_expertise?: string }> = {};
    for (const t of (topicDefaults || [])) {
      topicDefaultsMap[t.id] = {
        tone: t.default_tone,
        writing_style: t.default_writing_style,
        audience_expertise: t.audience_expertise,
      };
    }

    // 3. For each topic, find qualifying articles and queue them directly
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

      if (articlesError) {
        console.error(`❌ Error fetching articles for topic ${topic_id}:`, articlesError);
        continue;
      }

      if (!articles || articles.length === 0) {
        console.log(`  ✨ No qualifying articles for topic ${topic_id}`);
        continue;
      }

      console.log(`  📄 Found ${articles.length} qualifying articles`);

      let topicQueued = 0;

      for (const article of articles as TopicArticle[]) {
        // Check if already queued (by topic_article_id)
        const { data: existingQueue } = await supabase
          .from('content_generation_queue')
          .select('id')
          .eq('topic_article_id', article.id)
          .maybeSingle();

        if (existingQueue) {
          console.log(`  ⏭️  Skipping article ${article.id}: already queued`);
          continue;
        }

        // Check if story already exists for this topic_article
        const { data: existingStory } = await supabase
          .from('stories')
          .select('id')
          .eq('topic_article_id', article.id)
          .maybeSingle();

        if (existingStory) {
          console.log(`  ⏭️  Skipping article ${article.id}: story already exists`);
          // Mark as processed so we don't re-evaluate
          await supabase
            .from('topic_articles')
            .update({ processing_status: 'processed' })
            .eq('id', article.id);
          continue;
        }

        // Insert into queue with topic voice defaults
        const defaults = topicDefaultsMap[article.topic_id] || {};
        const { error: insertError } = await supabase
          .from('content_generation_queue')
          .insert({
            topic_article_id: article.id,
            shared_content_id: article.shared_content_id,
            status: 'pending',
            created_at: new Date().toISOString(),
            attempts: 0,
            max_attempts: 3,
            tone: defaults.tone || null,
            writing_style: defaults.writing_style || null,
            audience_expertise: defaults.audience_expertise || null,
          });

        if (insertError) {
          console.error(`  ❌ Error queueing article ${article.id}:`, insertError);
          continue;
        }

        // Mark topic_article as processed
        await supabase
          .from('topic_articles')
          .update({ processing_status: 'processed' })
          .eq('id', article.id);

        console.log(`  ✅ Queued article ${article.id} (score: ${article.content_quality_score}%)`);
        totalQueued++;
        topicQueued++;
      }

      if (topicQueued > 0) {
        topicsWithNewItems.push(topic_id);
      }
    }

    // 3. If we queued anything, invoke queue-processor to generate stories immediately
    if (totalQueued > 0) {
      console.log(`\n🚀 Invoking queue-processor for ${totalQueued} queued items...`);
      try {
        const { error: qpError } = await supabase.functions.invoke('queue-processor', {
          body: {},
        });
        if (qpError) {
          console.error('❌ queue-processor invocation error:', qpError);
        } else {
          console.log('✅ queue-processor completed successfully');
        }
      } catch (err) {
        console.error('❌ queue-processor invocation exception:', err);
      }

      // 4. After processing, invoke auto-illustrate for each topic that had new items
      for (const topicId of topicsWithNewItems) {
        console.log(`🎨 Invoking auto-illustrate-stories for topic ${topicId}...`);
        try {
          const { error: aiError } = await supabase.functions.invoke('auto-illustrate-stories', {
            body: { topicId, maxIllustrations: 5 },
          });
          if (aiError) {
            console.error(`❌ auto-illustrate error for topic ${topicId}:`, aiError);
          } else {
            console.log(`✅ auto-illustrate completed for topic ${topicId}`);
          }
        } catch (err) {
          console.error(`❌ auto-illustrate exception for topic ${topicId}:`, err);
        }
      }
    }

    // 5. Log summary
    console.log(`\n📊 Auto-simplify queue summary: ${totalQueued} articles queued across ${topicsWithNewItems.length} topics`);

    await supabase.from('system_logs').insert({
      event_type: 'auto_simplify_queue',
      severity: 'info',
      message: `Auto-simplify queue check completed`,
      metadata: {
        timestamp: startTime,
        topics_checked: topicSettings.length,
        topics_with_new_items: topicsWithNewItems.length,
        total_queued: totalQueued,
        invoked_queue_processor: totalQueued > 0,
        invoked_auto_illustrate: topicsWithNewItems.length > 0,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        topics_checked: topicSettings.length,
        topics_with_new_items: topicsWithNewItems.length,
        queued: totalQueued,
        invoked_queue_processor: totalQueued > 0,
        invoked_auto_illustrate: topicsWithNewItems,
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
