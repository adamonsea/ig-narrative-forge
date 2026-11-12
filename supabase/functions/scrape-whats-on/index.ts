/**
 * scrape-whats-on — every kind of events source for a feed (event_sources).
 * The right reader is picked by the source's kind (see readers/index.ts); a
 * pasted address is auto-detected, so owners never choose a kind.
 *
 * Actions (JSON body):
 *   { action: 'preview', topicId, url }                    owner: what would be found, nothing saved
 *   { action: 'save', topicId, url, name?, kind? }         owner: save the source and store its events
 *   { action: 'update', sourceId, name?, url? }            owner: rename and/or change the address
 *   { action: 'refresh', sourceId }                        owner: re-check one source
 *   { action: 'remove', sourceId }                         owner: remove a source and its upcoming events
 *   {} or { action: 'refresh_all' }                        daily job (EVENTS_CRON_TOKEN / service role)
 *
 * Stores facts and the link only: title, start date/time, venue, source URL, source name.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { getUser, userOwnsTopic, isServiceRole } from '../_shared/auth.ts';
import { londonToday } from './extract.ts';
import { isPublicHttpUrl } from './read.ts';
import { detectKind, isEventSourceKind, readerFor, type EventReader, type ReaderEvent, type ReaderResult } from './readers/index.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const Url = z.string().url().max(2000);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), topicId: z.string().uuid(), url: Url }),
  z.object({ action: z.literal('save'), topicId: z.string().uuid(), url: Url, name: z.string().trim().max(120).optional(), kind: z.string().max(40).optional() }),
  z.object({ action: z.literal('update'), sourceId: z.string().uuid(), url: Url.optional(), name: z.string().trim().min(1).max(120).optional() }),
  z.object({ action: z.literal('refresh'), sourceId: z.string().uuid() }),
  z.object({ action: z.literal('remove'), sourceId: z.string().uuid() }),
  z.object({ action: z.literal('refresh_all') }),
]);

// deno-lint-ignore no-explicit-any
type Db = any;
interface Source { id: string; topic_id: string; url: string; name: string; kind: string; method?: string | null; consecutive_empty_checks?: number }

// ---------- reading ----------

async function readSafely(reader: EventReader, url: string, fallbackName: string): Promise<ReaderResult> {
  if (!isPublicHttpUrl(url)) return { events: [], method: null, name: fallbackName, error: 'That address can’t be read.' };
  try {
    return await reader.read(url);
  } catch (e) {
    return { events: [], method: null, name: fallbackName, error: e instanceof Error ? e.message : 'Read failed' };
  }
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// ---------- storing (shared by every kind) ----------

async function storeEvents(supabase: Db, reader: EventReader, source: Source, events: ReaderEvent[]) {
  if (!events.length) return; // never wipe a source's events on an empty read
  const now = new Date().toISOString();
  const rows = events.map((e) => ({
    topic_id: source.topic_id,
    event_source_id: source.id,
    source_api: reader.sourceApi,
    external_id: reader.externalId(source.id, e.key),
    title: e.title,
    description: e.description ?? null,
    start_date: e.start_date,
    start_time: e.start_time,
    end_time: e.end_time ?? null,
    location: e.venue,
    category: e.category ?? null,
    source_url: e.url || source.url,
    source_name: e.source_name || source.name,
    event_type: 'events',
    updated_at: now,
    // status only for readers that re-publish; otherwise curator removals stay removed
    ...(reader.republish ? { status: 'published' } : {}),
  }));
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'topic_id,source_api,external_id' });
  if (error) throw new Error(error.message);
  // Drop upcoming events from this source that it no longer lists
  const keep = rows.map((r) => `"${String(r.external_id).replace(/"/g, '')}"`).join(',');
  await supabase.from('events').delete()
    .eq('event_source_id', source.id).gte('start_date', londonToday())
    .not('external_id', 'in', `(${keep})`);
}

async function deleteUpcoming(supabase: Db, source: Source) {
  const today = londonToday();
  await supabase.from('events').delete().eq('event_source_id', source.id).gte('start_date', today);
  // Rows written before events were linked to a source
  if (source.kind === 'whats_on_page') {
    await supabase.from('events').delete().eq('topic_id', source.topic_id).eq('source_api', 'whats_on')
      .is('event_source_id', null).like('external_id', `${source.id}:%`).gte('start_date', today);
  }
}

/**
 * Temporary: while topics.event_source_url still exists, the old importer keeps
 * reading it. When the owner edits or removes the matching calendar feed here,
 * mirror that so the old importer doesn't bring removed events back.
 * Delete this once topics.event_source_url is dropped.
 */
async function mirrorLegacyCalendarUrl(supabase: Db, source: Source, newUrl: string | null) {
  if (source.kind !== 'calendar_feed') return;
  const { data: topic } = await supabase.from('topics').select('event_source_url').eq('id', source.topic_id).maybeSingle();
  if (!topic || topic.event_source_url !== source.url) return;
  await supabase.from('topics').update({ event_source_url: newUrl }).eq('id', source.topic_id);
  if (newUrl === null) {
    await supabase.from('events').delete().eq('topic_id', source.topic_id).eq('source_api', 'chamber_feed')
      .is('event_source_id', null).gte('start_date', londonToday());
  }
}

async function checkSource(supabase: Db, source: Source) {
  const reader = readerFor(source.kind);
  const result = await readSafely(reader, source.url, source.name);
  let storeError: string | null = null;
  try { await storeEvents(supabase, reader, source, result.events); } catch (e) { storeError = e instanceof Error ? e.message : 'Store failed'; }
  const empty = result.events.length === 0;
  await supabase.from('event_sources').update({
    last_checked_at: new Date().toISOString(),
    last_event_count: result.events.length,
    consecutive_empty_checks: empty ? (source.consecutive_empty_checks || 0) + 1 : 0,
    last_error: result.error ?? storeError,
    method: result.method ?? source.method ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id);
  return { sourceId: source.id, name: source.name, kind: reader.kind, found: result.events.length, method: result.method, error: result.error ?? storeError };
}

const summarise = (kind: string, r: ReaderResult) => ({
  kind,
  found: r.events.length,
  method: r.method,
  name: r.name,
  error: r.error ?? null,
  examples: r.events.slice(0, 3).map((e) => ({ title: e.title, start_date: e.start_date, start_time: e.start_time, venue: e.venue })),
});

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
      console.log(`refresh_all: ${results.length} sources`, JSON.stringify(results));
      return json({ success: true, results });
    }

    // Everything else needs the feed's owner
    const user = isSystem ? null : await getUser(req);
    if (!isSystem && !user) return json({ error: 'Please sign in' }, 401);

    if (body.action === 'preview' || body.action === 'save') {
      if (!isSystem && !(await userOwnsTopic(supabase, user!.id, body.topicId))) return json({ error: 'Not your feed' }, 403);
      const url = body.url.trim();
      if (!isPublicHttpUrl(url)) return json({ success: false, kind: 'whats_on_page', found: 0, error: 'That address can’t be read.', examples: [] }, body.action === 'save' ? 422 : 200);
      const kind = body.action === 'save' && isEventSourceKind(body.kind) ? body.kind : await detectKind(url);
      const reader = readerFor(kind);
      const result = await readSafely(reader, url, hostOf(url));
      const summary = summarise(kind, result);
      if (body.action === 'preview') return json({ success: true, ...summary });

      if (!result.events.length) return json({ success: false, ...summary, error: summary.error || 'No upcoming events found at this address.' }, 422);
      const name = body.name?.trim() || result.name;
      const { data: source, error } = await supabase.from('event_sources').upsert({
        topic_id: body.topicId, url, name, kind, method: result.method, is_active: true, created_by: user?.id ?? null,
        last_checked_at: new Date().toISOString(), last_event_count: result.events.length, consecutive_empty_checks: 0,
        last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'topic_id,url' }).select('*').single();
      if (error) throw error;
      await storeEvents(supabase, reader, source, result.events);
      return json({ success: true, ...summary, name, sourceId: source.id });
    }

    // update / refresh / remove one saved source
    const { data: source } = await supabase.from('event_sources').select('*').eq('id', body.sourceId).maybeSingle();
    if (!source) return json({ error: 'Not found' }, 404);
    if (!isSystem && !(await userOwnsTopic(supabase, user!.id, source.topic_id))) return json({ error: 'Not your feed' }, 403);

    if (body.action === 'remove') {
      await mirrorLegacyCalendarUrl(supabase, source, null);
      await deleteUpcoming(supabase, source);
      await supabase.from('event_sources').delete().eq('id', source.id);
      return json({ success: true });
    }

    if (body.action === 'update') {
      const newUrl = body.url?.trim();
      if (newUrl && newUrl !== source.url) {
        if (!isPublicHttpUrl(newUrl)) return json({ error: 'That address can’t be read.' }, 422);
        const { data: clash } = await supabase.from('event_sources').select('id').eq('topic_id', source.topic_id).eq('url', newUrl).neq('id', source.id).maybeSingle();
        if (clash) return json({ error: 'That address is already in your list.' }, 409);
        const kind = await detectKind(newUrl);
        const reader = readerFor(kind);
        const result = await readSafely(reader, newUrl, hostOf(newUrl));
        if (!result.events.length) return json({ success: false, ...summarise(kind, result), error: result.error || 'No upcoming events found at this address.' }, 422);
        await mirrorLegacyCalendarUrl(supabase, source, kind === 'calendar_feed' ? newUrl : null);
        await deleteUpcoming(supabase, source);
        const updated = { ...source, url: newUrl, kind, name: body.name || source.name };
        await supabase.from('event_sources').update({
          url: newUrl, kind, name: updated.name, method: result.method, last_checked_at: new Date().toISOString(),
          last_event_count: result.events.length, consecutive_empty_checks: 0, last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', source.id);
        await storeEvents(supabase, reader, updated, result.events);
        return json({ success: true, ...summarise(kind, result), name: updated.name });
      }
      if (body.name && body.name !== source.name) {
        await supabase.from('event_sources').update({ name: body.name, updated_at: new Date().toISOString() }).eq('id', source.id);
        // Readers see the new name on events credited to the source itself
        await supabase.from('events').update({ source_name: body.name }).eq('event_source_id', source.id).eq('source_name', source.name);
      }
      return json({ success: true, name: body.name ?? source.name });
    }

    return json({ success: true, ...(await checkSource(supabase, source)) });
  } catch (error) {
    console.error('scrape-whats-on failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Something went wrong reading that address.' }, 500);
  }
});
