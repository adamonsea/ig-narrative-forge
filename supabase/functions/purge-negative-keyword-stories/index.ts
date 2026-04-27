import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurgeMatch {
  story_id: string;
  topic_article_id: string;
  shared_content_id: string;
  title: string;
  source_url: string | null;
  matched_keyword: string;
  field: 'title' | 'body';
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: require a valid user JWT and confirm the caller owns the topic
    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body.topicId;
    const dryRun: boolean = body.dryRun !== false; // default true
    const overrideKeywords: string[] | undefined = Array.isArray(body.keywords) ? body.keywords : undefined;

    if (!topicId || typeof topicId !== 'string') {
      return new Response(JSON.stringify({ error: 'topicId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Confirm caller owns this topic
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, created_by, negative_keywords')
      .eq('id', topicId)
      .maybeSingle();

    if (topicError || !topic) {
      return new Response(JSON.stringify({ error: 'Topic not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (topic.created_by && topic.created_by !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden: not your topic' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const keywords: string[] = (overrideKeywords ?? topic.negative_keywords ?? [])
      .map((k: string) => (k || '').trim().toLowerCase())
      .filter((k: string) => k.length > 0);

    if (keywords.length === 0) {
      return new Response(JSON.stringify({
        success: true, dryRun, topicId, topicName: topic.name,
        keywords: [], matches: [], purged: 0,
        message: 'No negative keywords configured',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`🔍 Purge scan for topic "${topic.name}" with keywords: ${keywords.join(', ')} (dryRun=${dryRun})`);

    // Page through stories joined with topic_articles + shared_article_content for this topic.
    // We do paginated fetch to stay under the default 1000-row limit on big topics.
    const matches: PurgeMatch[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const { data: stories, error: storiesErr } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          created_at,
          topic_article_id,
          topic_articles!inner (
            id,
            topic_id,
            shared_content_id,
            shared_article_content (
              id,
              title,
              body,
              source_url
            )
          )
        `)
        .eq('topic_articles.topic_id', topicId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (storiesErr) {
        console.error('Stories fetch error:', storiesErr);
        return new Response(JSON.stringify({ error: storiesErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!stories || stories.length === 0) break;

      for (const s of stories as any[]) {
        const ta = s.topic_articles;
        const sac = ta?.shared_article_content;
        if (!ta || !sac) continue;

        const titleLower = (sac.title || s.title || '').toLowerCase();
        const bodyLower = (sac.body || '').toLowerCase();

        for (const kw of keywords) {
          let field: 'title' | 'body' | null = null;
          if (titleLower.includes(kw)) field = 'title';
          else if (bodyLower.includes(kw)) field = 'body';

          if (field) {
            matches.push({
              story_id: s.id,
              topic_article_id: ta.id,
              shared_content_id: sac.id,
              title: sac.title || s.title || '(untitled)',
              source_url: sac.source_url ?? null,
              matched_keyword: kw,
              field,
              created_at: s.created_at,
            });
            break; // one keyword per story is enough
          }
        }
      }

      if (stories.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`🎯 Found ${matches.length} matching stories`);

    if (dryRun || matches.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        topicId,
        topicName: topic.name,
        keywords,
        matches,
        purged: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Execute purge
    let purged = 0;
    const errors: string[] = [];

    for (const m of matches) {
      try {
        // 1. Delete the story
        const { error: delErr } = await supabase
          .from('stories')
          .delete()
          .eq('id', m.story_id);
        if (delErr) throw new Error(`delete story: ${delErr.message}`);

        // 2. Mark topic_article as discarded so it won't be re-queued
        const { error: taErr } = await supabase
          .from('topic_articles')
          .update({ processing_status: 'discarded' })
          .eq('id', m.topic_article_id);
        if (taErr) throw new Error(`update topic_article: ${taErr.message}`);

        // 3. Suppress future re-scrape via discarded_articles
        if (m.source_url) {
          const normalized = m.source_url.toLowerCase().trim();
          await supabase.from('discarded_articles').upsert({
            topic_id: topicId,
            url: m.source_url,
            normalized_url: normalized,
            title: m.title,
            discarded_reason: `Negative keyword: ${m.matched_keyword} (retroactive purge)`,
          }, { onConflict: 'topic_id,normalized_url', ignoreDuplicates: true });
        }

        purged++;
        console.log(`🗑️ Purged story ${m.story_id} ("${m.title.substring(0, 60)}") — kw: ${m.matched_keyword}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to purge story ${m.story_id}: ${msg}`);
        errors.push(`${m.story_id}: ${msg}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun: false,
      topicId,
      topicName: topic.name,
      keywords,
      matches,
      purged,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('purge-negative-keyword-stories error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});