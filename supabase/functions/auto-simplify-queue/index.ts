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

/**
 * Locality gate: for regional topics, require at least one strong local anchor
 * (region name, landmark, postcode, organization) in the title or opening of
 * the article. Generic keyword matches alone do NOT qualify a story for
 * automation. Matching is case-insensitive with word-boundary precision.
 * Returns the matched anchor (string) or null if no anchor was found.
 */
function stripBoilerplate(body: string): string {
  return (body || '')
    // Common scraped chrome / nav prefixes
    .replace(/sign in\s+subscribe/gi, ' ')
    .replace(/\bsubscribe\b/gi, ' ')
    // "Published 27th Jun 2026, 18:02 BST" / "Updated ... BST"
    .replace(/\b(published|updated)\b[^.]*?\bbst\b/gi, ' ')
    // Bylines: "By Sam Morton Chief Reporter"
    .replace(/\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchLocalityAnchor(title: string, body: string, anchors: string[]): string | null {
  if (!anchors || anchors.length === 0) return 'no-anchors-configured'; // don't block
  const cleanedBody = stripBoilerplate(body).slice(0, 1200);
  const haystack = `${title || ''} ${cleanedBody}`.toLowerCase();
  for (const anchor of anchors) {
    if (!anchor) continue;
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(haystack)) return anchor;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate service-role authorization (internal function)
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  let jwtRole: string | null = null;
  try {
    const payload = token ? JSON.parse(atob(token.split('.')[1])) : null;
    jwtRole = payload?.role;
  } catch {}
  if (jwtRole !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: internal function requires service_role' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
      .select('id, default_tone, default_writing_style, audience_expertise, negative_keywords, topic_type, region, landmarks, postcodes, organizations')
      .in('id', topicIds);
    
    const topicDefaultsMap: Record<string, { tone?: string; writing_style?: string; audience_expertise?: string; negative_keywords?: string[]; topic_type?: string; region?: string; localityAnchors?: string[] }> = {};
    for (const t of (topicDefaults || [])) {
      const anchors = [
        t.region,
        ...(t.landmarks || []),
        ...(t.postcodes || []),
        ...(t.organizations || []),
      ]
        .filter((a: string | null) => !!a && String(a).trim().length > 0)
        .map((a: string) => String(a).toLowerCase().trim());
      topicDefaultsMap[t.id] = {
        tone: t.default_tone,
        writing_style: t.default_writing_style,
        audience_expertise: t.audience_expertise,
        negative_keywords: t.negative_keywords || [],
        topic_type: t.topic_type,
        region: t.region || '',
        localityAnchors: Array.from(new Set(anchors)),
      };
    }

    // 3. For each topic, find qualifying articles and queue them directly
    for (const settings of topicSettings as TopicAutomationSettings[]) {
      const { topic_id, quality_threshold } = settings;

      console.log(`\n🔍 Processing topic: ${topic_id} (threshold: ${quality_threshold}%)`);

      // Fetch articles that are new and above threshold.
      // IMPORTANT: title/body are JOINED here (not fetched per-row later) so the
      // locality gate always sees real content. A per-row fetch that silently
      // returns null on transient errors was causing valid local stories to be
      // held at random ("intermittent" gate failures).
      const { data: articles, error: articlesError } = await supabase
        .from('topic_articles')
        .select('id, shared_content_id, content_quality_score, topic_id, shared_article_content(title, body, url)')
        .eq('topic_id', topic_id)
        .eq('processing_status', 'new')
        .gte('content_quality_score', quality_threshold)
        .order('content_quality_score', { ascending: false })
        .order('created_at', { ascending: false })
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

      const negativeKeywords = topicDefaultsMap[topic_id]?.negative_keywords || [];
      const topicType = topicDefaultsMap[topic_id]?.topic_type;
      const localityAnchors = topicDefaultsMap[topic_id]?.localityAnchors || [];
      const localityGateActive = topicType === 'regional' && localityAnchors.length > 0;
      let topicHeldForLocality = 0;

      for (const article of articles as any[]) {
        // Content comes from the JOIN above. Supabase returns the embedded row as
        // an object (or null). Normalise to a single record.
        const embedded = article.shared_article_content;
        let sharedContent: { title: string | null; body: string | null; url: string | null } | null =
          Array.isArray(embedded) ? (embedded[0] ?? null) : (embedded ?? null);

        // Defensive fallback: if the JOIN somehow returned no content but we need
        // it for gating, fetch once. On failure we DO NOT hold (fail-open) below.
        if (!sharedContent && (negativeKeywords.length > 0 || localityGateActive) && article.shared_content_id) {
          const { data } = await supabase
            .from('shared_article_content')
            .select('title, body, url')
            .eq('id', article.shared_content_id)
            .maybeSingle();
          sharedContent = data;
        }

        // Negative keyword check: reject matches
        if (negativeKeywords.length > 0 && sharedContent) {
          const fullText = `${(sharedContent.title || '').toLowerCase()} ${(sharedContent.body || '').toLowerCase()}`;
          const matchedKeyword = negativeKeywords.find((kw: string) => fullText.includes(kw.toLowerCase()));
          if (matchedKeyword) {
            console.log(`  🚫 Discarding article ${article.id}: negative keyword "${matchedKeyword}"`);
            await supabase
              .from('topic_articles')
              .update({ processing_status: 'discarded' })
              .eq('id', article.id);
            // Record in discarded_articles for suppression
            const sourceUrl = sharedContent.url || article.shared_content_id;
            await supabase.from('discarded_articles').upsert({
              topic_id: topic_id,
              url: sourceUrl,
              normalized_url: sourceUrl.toLowerCase().trim(),
              title: sharedContent.title,
              discarded_reason: `Negative keyword: ${matchedKeyword}`,
              discarded_by: 'auto-simplify-queue',
            }, { onConflict: 'topic_id,normalized_url', ignoreDuplicates: true });
            continue;
          }
        }

        // Locality gate (regional topics only): hold for manual review if no local
        // anchor appears in the title or opening. Story stays 'new' in Arrivals.
        if (localityGateActive) {
          const title = sharedContent?.title || '';
          const body = sharedContent?.body || '';
          const region = (topicDefaultsMap[topic_id]?.region || '').toLowerCase().trim();

          // FAIL-OPEN: never hold an at/above-threshold story that literally names
          // the region anywhere in title or body. A 100%-score "Eastbourne …"
          // headline must always pass.
          const regionPresent = !!region &&
            `${title} ${body}`.toLowerCase().includes(region);

          const matchedAnchor = matchLocalityAnchor(title, body, localityAnchors);

          if (!matchedAnchor && !regionPresent) {
            // Diagnostic: log WHY it was held (content presence + a title snippet).
            console.log(
              `  🧭 Locality gate HELD article ${article.id} — ` +
              `hasContent=${!!sharedContent} anchors=${localityAnchors.length} ` +
              `title="${title.slice(0, 80)}"`
            );
            topicHeldForLocality++;
            continue; // leave processing_status = 'new'
          }

          console.log(
            `  ✅ Locality gate PASSED article ${article.id} via ` +
            `${matchedAnchor ? `anchor "${matchedAnchor}"` : `region "${region}"`}`
          );
        }

        // Check for an ACTIVE queue item only (pending/processing).
        // A finished (completed/failed) row must NOT block re-evaluation —
        // otherwise "zombie" articles permanently clog the top-of-queue fetch.
        const { data: activeQueue } = await supabase
          .from('content_generation_queue')
          .select('id')
          .eq('topic_article_id', article.id)
          .in('status', ['pending', 'processing'])
          .maybeSingle();

        if (activeQueue) {
          console.log(`  ⏭️  Skipping article ${article.id}: active queue item in progress`);
          continue;
        }

        // Check if a story already exists for this topic_article
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

        // No active queue item and no story. If a stale (completed/failed) queue
        // row exists for this article, remove it so we can re-queue cleanly.
        await supabase
          .from('content_generation_queue')
          .delete()
          .eq('topic_article_id', article.id);

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

      if (topicHeldForLocality > 0) {
        console.log(`  🧭 Locality gate held ${topicHeldForLocality} article(s) for manual review in topic ${topic_id}`);
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
