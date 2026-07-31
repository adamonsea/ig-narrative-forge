import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional scoping / manual retrigger controls
    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }
    const region: string | undefined = body?.region?.trim() || undefined;
    const topicId: string | undefined = body?.topicId || undefined;
    const manual: boolean = body?.manual === true || !!region || !!topicId;

    // Safety: never requeue work that may still be actively running.
    // Auto mode uses the 10-minute stuck cutoff. Manual mode is more eager for
    // pending/failed items (no age filter) but still refuses to touch anything
    // that entered `processing` within the last 5 minutes — otherwise the
    // retrigger can start a second concurrent generation for the same article.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const inFlightGuard = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const cutoff = manual ? inFlightGuard : tenMinutesAgo;

    // Resolve topic scope from region if provided
    let scopedTopicIds: string[] | null = null;
    if (topicId) {
      scopedTopicIds = [topicId];
    } else if (region) {
      const { data: topicsInRegion, error: topicsErr } = await supabase
        .from('topics')
        .select('id')
        .ilike('region', region);
      if (topicsErr) console.error('❌ Error resolving region topics:', topicsErr);
      scopedTopicIds = (topicsInRegion || []).map((t: any) => t.id);
      if (!scopedTopicIds.length) {
        return new Response(
          JSON.stringify({ success: true, note: `No topics found for region "${region}"`, totalRecovered: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If scoped, resolve topic_article_ids belonging to those topics
    let scopedTopicArticleIds: string[] | null = null;
    if (scopedTopicIds) {
      const { data: tas, error: taErr } = await supabase
        .from('topic_articles')
        .select('id')
        .in('topic_id', scopedTopicIds);
      if (taErr) console.error('❌ Error resolving topic_articles:', taErr);
      scopedTopicArticleIds = (tas || []).map((r: any) => r.id);
    }

    console.log('🔄 Recovery started', { manual, region, topicId, scopedTopicArticleIds: scopedTopicArticleIds?.length });

    // === PART 1: Recover Stuck Stories ===
    let storiesQuery = supabase
      .from('stories')
      .select('id, article_id, topic_article_id, title, status, updated_at')
      .eq('status', 'processing')
      .lt('updated_at', cutoff);
    if (scopedTopicArticleIds) {
      storiesQuery = scopedTopicArticleIds.length
        ? storiesQuery.in('topic_article_id', scopedTopicArticleIds)
        : storiesQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
    const { data: stuckStories, error: storiesError } = await storiesQuery;

    if (storiesError) {
      console.error('❌ Error finding stuck stories:', storiesError);
    } else if (stuckStories && stuckStories.length > 0) {
      console.log(`🚨 Found ${stuckStories.length} stuck stories:`, 
        stuckStories.map(s => ({ id: s.id, title: s.title, stuckSince: s.updated_at }))
      );

      // Reset stories to draft
      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .in('id', stuckStories.map(s => s.id));

      if (resetError) {
        console.error('❌ Error resetting stuck stories:', resetError);
      } else {
        console.log('✅ Reset stuck stories to draft');

        // Re-queue them for processing
        const reQueueData = stuckStories.map(story => ({
          article_id: story.article_id,
          topic_article_id: story.topic_article_id,
          status: 'pending',
          created_at: new Date().toISOString()
        }));

        // Insert one-by-one so unique-conflict on a single article (23505 —
        // already has an active job) doesn't abort the whole batch.
        let requeued = 0;
        let skippedDup = 0;
        for (const row of reQueueData) {
          const { error: qErr } = await supabase.from('content_generation_queue').insert(row);
          if (!qErr) requeued++;
          else if ((qErr as any).code === '23505') skippedDup++;
          else console.error('❌ Error re-queuing story:', qErr);
        }
        console.log(`✅ Re-queued ${requeued} stories (${skippedDup} already queued, skipped)`);
      }
    } else {
      console.log('✨ No stuck stories found');
    }

    // === PART 2: Recover Stuck Queue Items ===
    let queueSelect = supabase
      .from('content_generation_queue')
      .select('id, article_id, topic_article_id, status, started_at');
    if (manual) {
      // In manual mode, requeue anything not completed (pending stuck, processing, failed).
      queueSelect = queueSelect.in('status', ['pending', 'processing', 'failed']);
    } else {
      queueSelect = queueSelect.or(
        `and(status.eq.processing,started_at.lt.${tenMinutesAgo}),` +
        `and(status.eq.pending,attempts.gte.3)`
      );
    }
    if (scopedTopicArticleIds) {
      queueSelect = scopedTopicArticleIds.length
        ? queueSelect.in('topic_article_id', scopedTopicArticleIds)
        : queueSelect.eq('id', '00000000-0000-0000-0000-000000000000');
    }
    const { data: stuckQueue, error: queueError } = await queueSelect;

    if (queueError) {
      console.error('❌ Error finding stuck queue items:', queueError);
    } else if (stuckQueue && stuckQueue.length > 0) {
      console.log(`🚨 Found ${stuckQueue.length} stuck queue items:`,
        stuckQueue.map(q => ({ id: q.id, stuckSince: q.started_at }))
      );

      const { error: resetQueueError } = await supabase
        .from('content_generation_queue')
        .update({ 
          status: 'pending',
          started_at: null,
          attempts: 0, // Reset attempts to give it a fresh start
          error_message: null
        })
        .in('id', stuckQueue.map(q => q.id));

      if (resetQueueError) {
        console.error('❌ Error resetting stuck queue items:', resetQueueError);
      } else {
        console.log(`✅ Reset ${stuckQueue.length} queue items to pending`);
      }
    } else {
      console.log('✨ No stuck queue items found');
    }

    // Kick the processor immediately so the user sees progress right away.
    // Process in a few passes since queue-processor handles 5 at a time.
    const totalReset = (stuckStories?.length || 0) + (stuckQueue?.length || 0);
    const passes = Math.min(6, Math.max(1, Math.ceil(totalReset / 5)));
    let processed = 0;
    for (let i = 0; i < passes; i++) {
      try {
        const { data: procData, error: procError } = await supabase.functions.invoke(
          'queue-processor',
          { body: {} }
        );
        if (procError) {
          console.warn('⚠️ queue-processor invoke error on pass', i + 1, procError);
          break;
        }
        const done = procData?.processed ?? procData?.jobsProcessed ?? 0;
        processed += done;
        console.log(`▶️ queue-processor pass ${i + 1}: processed=${done}`);
        if (!done) break;
      } catch (e) {
        console.warn('⚠️ queue-processor invoke threw on pass', i + 1, e);
        break;
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      stuckStoriesRecovered: stuckStories?.length || 0,
      stuckQueueItemsRecovered: stuckQueue?.length || 0,
      totalRecovered: totalReset,
      processedNow: processed
    };

    console.log('📊 Auto-recovery summary:', summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Auto-recovery function error:', error);
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
