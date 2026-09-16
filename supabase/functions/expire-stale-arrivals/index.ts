import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ROWS = 500;
const DEFAULT_MAX_AGE_DAYS = 4;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Supabase environment variables' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const rawDays = Number(body.maxAgeDays);
    const maxAgeDays = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 60
      ? Math.floor(rawDays)
      : DEFAULT_MAX_AGE_DAYS;
    const dryRun = body.dryRun === true;
    const topicId = typeof body.topicId === 'string' && body.topicId.length > 0 ? body.topicId : null;

    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

    // Stale, never-written arrivals only. Anything already processed, discarded
    // or turned into a story is untouched.
    let query = supabase
      .from('topic_articles')
      .select('id, topic_id, shared_content_id, shared_article_content(title, url)')
      .eq('processing_status', 'new')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS);

    if (topicId) query = query.eq('topic_id', topicId);

    const { data: candidates, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expired: 0, maxAgeDays, message: 'Nothing stale to clear' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety: never discard something that already produced a story.
    const ids = candidates.map((c) => c.id as string);
    const withStory = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from('stories')
        .select('topic_article_id')
        .in('topic_article_id', ids.slice(i, i + 200));
      for (const row of data || []) {
        if (row.topic_article_id) withStory.add(row.topic_article_id as string);
      }
    }

    const targets = candidates.filter((c) => !withStory.has(c.id as string));
    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expired: 0, maxAgeDays, message: 'All stale candidates already have stories' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ success: true, dryRun: true, wouldExpire: targets.length, maxAgeDays }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record in discarded_articles so they are not re-scraped.
    const discardRows = targets
      .map((t) => {
        const embedded = (t as Record<string, unknown>).shared_article_content;
        const content = (Array.isArray(embedded) ? embedded[0] : embedded) as
          | { title?: string | null; url?: string | null }
          | null;
        const url = content?.url || (t.shared_content_id as string | null);
        if (!url) return null;
        return {
          topic_id: t.topic_id as string,
          url,
          normalized_url: String(url).toLowerCase().trim(),
          title: content?.title ?? null,
          discarded_reason: `Stale arrival: unreviewed for more than ${maxAgeDays} days`,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (let i = 0; i < discardRows.length; i += 200) {
      const { error: discardError } = await supabase
        .from('discarded_articles')
        .upsert(discardRows.slice(i, i + 200), {
          onConflict: 'topic_id,normalized_url',
          ignoreDuplicates: true,
        });
      if (discardError) console.error('discarded_articles upsert failed:', discardError);
    }

    const targetIds = targets.map((t) => t.id as string);
    let expired = 0;
    for (let i = 0; i < targetIds.length; i += 200) {
      const part = targetIds.slice(i, i + 200);
      const { error: updateError } = await supabase
        .from('topic_articles')
        .update({ processing_status: 'discarded', held_reason: 'stale_arrival' })
        .in('id', part);
      if (updateError) {
        console.error('Failed to expire batch:', updateError);
        continue;
      }
      expired += part.length;
    }

    console.log(`🧹 Expired ${expired} stale arrivals (older than ${maxAgeDays} days)`);

    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Stale arrivals expired',
      context: { expired, maxAgeDays, topicId },
      function_name: 'expire-stale-arrivals',
    });

    return new Response(
      JSON.stringify({ success: true, expired, maxAgeDays, hadMore: candidates.length === MAX_ROWS }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('expire-stale-arrivals error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
