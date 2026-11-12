/**
 * scrape-whats-on — reads a pasted "what's on" page and keeps its upcoming events.
 *
 * Actions (JSON body):
 *   { action: 'preview', topicId, url }          owner: what would be found, nothing saved
 *   { action: 'save', topicId, url, name? }      owner: save the page and store its events
 *   { action: 'refresh', sourceId }              owner: re-check one saved page
 *   { action: 'remove', sourceId }               owner: remove a page and its upcoming events
 *   {} or { action: 'refresh_all' }              daily job (EVENTS_CRON_TOKEN / service role)
 *
 * Stores facts and the link only: title, start date/time, venue, source URL, source name.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { getUser, userOwnsTopic, isServiceRole } from '../_shared/auth.ts';
import { type WhatsOnEvent, londonToday, normaliseForMatch } from './extract.ts';
import { readWhatsOn, type ReadResult } from './read.ts';

const SOURCE_API = 'whats_on';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), topicId: z.string().uuid(), url: z.string().url().max(2000) }),
  z.object({ action: z.literal('save'), topicId: z.string().uuid(), url: z.string().url().max(2000), name: z.string().trim().max(120).optional() }),
  z.object({ action: z.literal('refresh'), sourceId: z.string().uuid() }),
  z.object({ action: z.literal('remove'), sourceId: z.string().uuid() }),
  z.object({ action: z.literal('refresh_all') }),
]);

// ---------- storing ----------

async function sha1(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

// deno-lint-ignore no-explicit-any
async function storeEvents(supabase: any, source: { id: string; topic_id: string; url: string; name: string }, events: WhatsOnEvent[]) {
  const today = londonToday();
  const rows = await Promise.all(events.map(async (e) => ({
    topic_id: source.topic_id,
    source_api: SOURCE_API,
    external_id: `${source.id}:${await sha1(`${normaliseForMatch(e.title)}|${e.start_date}|${e.start_time ?? ''}`)}`,
    title: e.title,
    start_date: e.start_date,
    start_time: e.start_time,
    location: e.venue,
    source_url: e.url || source.url,
    source_name: source.name,
    event_type: 'events',
    updated_at: new Date().toISOString(),
    // status left out on purpose: new rows default to published, and events a
    // curator removed from the card stay removed on later checks.
  })));

  if (rows.length) {
    const { error } = await supabase.from('events').upsert(rows, { onConflict: 'topic_id,source_api,external_id' });
    if (error) throw new Error(error.message);
    // Drop upcoming events from this page that it no longer lists
    const keep = rows.map((r) => `"${r.external_id}"`).join(',');
    await supabase.from('events').delete()
      .eq('topic_id', source.topic_id).eq('source_api', SOURCE_API)
      .like('external_id', `${source.id}:%`).gte('start_date', today)
      .not('external_id', 'in', `(${keep})`);
  }
}

// deno-lint-ignore no-explicit-any
async function checkSource(supabase: any, source: any) {
  let result: ReadResult;
  try {
    result = await readWhatsOn(source.url);
  } catch (e) {
    result = { events: [], method: null, name: source.name, error: e instanceof Error ? e.message : 'Read failed' };
  }
  let storeError: string | null = null;
  if (result.events.length) {
    try { await storeEvents(supabase, source, result.events); } catch (e) { storeError = e instanceof Error ? e.message : 'Store failed'; }
  }
  const empty = result.events.length === 0;
  await supabase.from('event_sources').update({
    last_checked_at: new Date().toISOString(),
    last_event_count: result.events.length,
    consecutive_empty_checks: empty ? (source.consecutive_empty_checks || 0) + 1 : 0,
    last_error: result.error ?? storeError,
    method: result.method ?? source.method,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id);
  return { sourceId: source.id, name: source.name, found: result.events.length, method: result.method, error: result.error ?? storeError };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw && typeof raw === 'object' && !('action' in raw) ? { action: 'refresh_all' } : raw);
    if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    const cronToken = Deno.env.get('EVENTS_CRON_TOKEN') || '';
    const isSystem = (cronToken.length > 0 && bearer === cronToken) || isServiceRole(req);

    if (body.action === 'refresh_all') {
      if (!isSystem) return json({ error: 'Unauthorized' }, 401);
      const { data: sources, error } = await supabase.from('event_sources').select('*').eq('is_active', true).order('last_checked_at', { ascending: true, nullsFirst: true }).limit(60);
      if (error) throw error;
      const results = [];
      for (const s of sources || []) results.push(await checkSource(supabase, s));
      console.log(`refresh_all: ${results.length} pages`, JSON.stringify(results));
      return json({ success: true, results });
    }

    // Everything else needs the feed's owner
    const user = isSystem ? null : await getUser(req);
    if (!isSystem && !user) return json({ error: 'Please sign in' }, 401);

    if (body.action === 'preview' || body.action === 'save') {
      if (!isSystem && !(await userOwnsTopic(supabase, user!.id, body.topicId))) return json({ error: 'Not your feed' }, 403);
      const url = body.url.trim();
      const result = await readWhatsOn(url);
      const summary = {
        found: result.events.length,
        method: result.method,
        name: result.name,
        error: result.error ?? null,
        examples: result.events.slice(0, 3).map((e) => ({ title: e.title, start_date: e.start_date, start_time: e.start_time, venue: e.venue })),
      };
      if (body.action === 'preview') return json({ success: true, ...summary });

      if (!result.events.length) return json({ success: false, ...summary, error: summary.error || 'No upcoming events found on this page.' }, 422);
      const name = body.name?.trim() || result.name;
      const { data: source, error } = await supabase.from('event_sources').upsert({
        topic_id: body.topicId, url, name, method: result.method, is_active: true, created_by: user?.id ?? null,
        last_checked_at: new Date().toISOString(), last_event_count: result.events.length, consecutive_empty_checks: 0,
        last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'topic_id,url' }).select('*').single();
      if (error) throw error;
      await storeEvents(supabase, source, result.events);
      return json({ success: true, ...summary, name, sourceId: source.id });
    }

    // refresh / remove one saved page
    const { data: source } = await supabase.from('event_sources').select('*').eq('id', body.sourceId).maybeSingle();
    if (!source) return json({ error: 'Not found' }, 404);
    if (!isSystem && !(await userOwnsTopic(supabase, user!.id, source.topic_id))) return json({ error: 'Not your feed' }, 403);

    if (body.action === 'remove') {
      await supabase.from('events').delete()
        .eq('topic_id', source.topic_id).eq('source_api', SOURCE_API)
        .like('external_id', `${source.id}:%`).gte('start_date', londonToday());
      await supabase.from('event_sources').delete().eq('id', source.id);
      return json({ success: true });
    }

    return json({ success: true, ...(await checkSource(supabase, source)) });
  } catch (error) {
    console.error('scrape-whats-on failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Something went wrong reading that page.' }, 500);
  }
});
