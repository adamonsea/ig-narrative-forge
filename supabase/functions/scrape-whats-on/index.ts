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
 *   { action: 'suggest', topicId, title, date, time?, venue, url, visitorId, website? }  anyone: a reader's event suggestion (Waiting only)
 *   {} or { action: 'refresh_all' }                        daily job (EVENTS_CRON_TOKEN / service role)
 *
 * Stores facts and the link only: title, start date/time, venue, source URL, source name.
 * Every event goes through the Desk, like news: each one gets a local-relevance score
 * (relevance.ts, same scorer as news). New events wait on the Desk ('pending') unless
 * their source is set to Auto-publish; clearly out-of-area events go to Hidden
 * ('excluded', with a reason) and never auto-publish. Owner decisions (Publish / Skip)
 * stick across refreshes (by event name, across the feed).
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { getUser, userOwnsTopic, isServiceRole } from '../_shared/auth.ts';
import { addDays, londonToday } from './extract.ts';
import { isPublicHttpUrl } from './read.ts';
import { listingUrlOk, suggestionDateOk, suggestionStatus, SUGGEST_PER_FEED_PER_DAY, SUGGEST_PER_READER_PER_DAY } from './suggestion.ts';
import { detectKind, isEventSourceKind, readerFor, type EventReader, type ReaderEvent, type ReaderResult } from './readers/index.ts';
import { buildPlaceProfile, hasLocalEvidence, judgeEvents, type PlaceProfile, type Verdict } from './locality.ts';
import { baseEventScore, combineRelevance, isOutOfArea, placeEvent } from './relevance.ts';
import type { TopicConfig } from '../_shared/hybrid-content-scoring.ts';

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
  z.object({
    action: z.literal('suggest'), topicId: z.string().uuid(),
    title: z.string().trim().min(3).max(160), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    venue: z.string().trim().min(2).max(160), url: Url, visitorId: z.string().trim().min(6).max(120),
    website: z.string().max(200).optional(), // honeypot: people never fill it
  }),
]);

// deno-lint-ignore no-explicit-any
type Db = any;
interface Source { id: string; topic_id: string; url: string; name: string; kind: string; method?: string | null; consecutive_empty_checks?: number; auto_publish?: boolean }

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

// ---------- location filter ----------

interface TopicContext { profile: PlaceProfile | null; config: TopicConfig | null }
type Profiles = Map<string, TopicContext>;

async function topicContextFor(supabase: Db, profiles: Profiles, topicId: string): Promise<TopicContext> {
  if (profiles.has(topicId)) return profiles.get(topicId)!;
  const { data } = await supabase.from('topics')
    .select('id, topic_type, region, keywords, landmarks, postcodes, organizations, competing_regions, nearby_places, locality_strength, big_story_override')
    .eq('id', topicId).maybeSingle();
  const ctx: TopicContext = {
    profile: buildPlaceProfile(data),
    config: data ? ({ ...data, keywords: data.keywords || [] } as TopicConfig) : null,
  };
  profiles.set(topicId, ctx);
  return ctx;
}

const placeProfileFor = async (supabase: Db, profiles: Profiles, topicId: string) => (await topicContextFor(supabase, profiles, topicId)).profile;

/** The location verdict and the local-relevance score for every event in one read. */
async function judgeAndScore(supabase: Db, profiles: Profiles, topicId: string, events: ReaderEvent[], sourceUrl: string) {
  const ctx = await topicContextFor(supabase, profiles, topicId);
  const verdicts = judgeEvents(events, ctx.profile, sourceUrl);
  const scores = events.map((e, i) => combineRelevance(baseEventScore(e, ctx.config), verdicts[i], hasLocalEvidence(e, ctx.profile)));
  return { verdicts, scores };
}

const titleKey = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------- storing (shared by every kind) ----------

/** Links that answer 404/410 (or don't answer). Up to 30 links, 6s each. */
async function deadLinks(urls: string[]): Promise<Set<string>> {
  const dead = new Set<string>();
  await Promise.all([...new Set(urls)].slice(0, 30).map(async (u) => {
    try {
      const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CuratrEvents/1.0)' } });
      if (r.status === 404 || r.status === 410) dead.add(u);
      await r.body?.cancel();
    } catch { /* timeouts and blocks: keep the link */ }
  }));
  return dead;
}

async function storeEvents(supabase: Db, reader: EventReader, source: Source, events: ReaderEvent[], verdicts: Verdict[], scores: (number | null)[]) {
  if (!events.length) return; // never wipe a source's events on an empty read
  const now = new Date().toISOString();
  const ids = events.map((e) => reader.externalId(source.id, e.key));

  // What the owner has already decided: removals and restores stick.
  const existing = new Map<string, { status: string; kept_by_owner: boolean; exclusion_reason: string | null }>();
  for (const part of chunks(ids, 150)) {
    const { data } = await supabase.from('events').select('external_id, status, kept_by_owner, exclusion_reason')
      .eq('topic_id', source.topic_id).eq('source_api', reader.sourceApi).in('external_id', part);
    for (const r of data || []) existing.set(r.external_id, r);
  }
  const removedTitles = new Set<string>();
  const keptTitles = new Set<string>();
  // By name across the whole feed: removing a show removes it whichever source lists it
  const { data: decided } = await supabase.from('events').select('title, status, kept_by_owner')
    .eq('topic_id', source.topic_id).or('status.eq.deleted,kept_by_owner.eq.true').limit(5000);
  for (const r of decided || []) {
    if (r.status === 'deleted') removedTitles.add(titleKey(r.title));
    else if (r.kept_by_owner) keptTitles.add(titleKey(r.title));
  }

  // Venue pages often vanish once a show starts: for events in the next two days,
  // check the link and fall back to the source's listings page if it's gone.
  const dead = await deadLinks(events.filter((e) => e.url && e.url !== source.url && e.start_date <= addDays(londonToday(), 1)).map((e) => e.url!));

  const rows = events.map((e, i) => {
    const id = ids[i];
    const prev = existing.get(id);
    const t = titleKey(e.title);
    const verdict = verdicts[i] ?? { keep: true };
    const score = scores[i] ?? null;
    const { status, reason, kept } = placeEvent({
      prev, removedByOwner: removedTitles.has(t), publishedByOwner: keptTitles.has(t),
      verdict, score, autoPublish: Boolean(source.auto_publish),
    });
    return {
      topic_id: source.topic_id,
      event_source_id: source.id,
      source_api: reader.sourceApi,
      external_id: id,
      title: e.title,
      description: e.description ?? null,
      start_date: e.start_date,
      start_time: e.start_time,
      end_time: e.end_time ?? null,
      location: e.venue,
      category: e.category ?? null,
      source_url: e.url && !dead.has(e.url) ? e.url : source.url,
      source_name: e.source_name || source.name,
      event_type: 'events',
      status,
      exclusion_reason: reason,
      kept_by_owner: kept,
      relevance_score: score,
      updated_at: now,
    };
  });
  // One row per id (a source can repeat itself)
  const unique = [...new Map(rows.map((r) => [r.external_id, r])).values()];
  const { error } = await supabase.from('events').upsert(unique, { onConflict: 'topic_id,source_api,external_id' });
  if (error) throw new Error(error.message);
  // Drop upcoming events from this source that it no longer lists
  const keep = unique.map((r) => `"${String(r.external_id).replace(/"/g, '')}"`).join(',');
  await supabase.from('events').delete()
    .eq('event_source_id', source.id).gte('start_date', londonToday())
    .not('external_id', 'in', `(${keep})`);
}

/**
 * When a source can't be read, still apply the location filter to what's already
 * stored from it (title and venue only), so a blocked page can't keep
 * out-of-area events in the feed.
 */
async function filterStored(supabase: Db, source: Source, profile: PlaceProfile | null) {
  if (!profile) return;
  const { data } = await supabase.from('events').select('id, title, location')
    .eq('event_source_id', source.id).eq('status', 'published').eq('kept_by_owner', false)
    .gte('start_date', londonToday()).limit(1000);
  const rows = (data || []) as { id: string; title: string; location: string | null }[];
  if (!rows.length) return;
  const verdicts = judgeEvents(rows.map((r) => ({ title: r.title, venue: r.location })), profile, source.url);
  const byReason = new Map<string, string[]>();
  verdicts.forEach((v, i) => { if (!v.keep && isOutOfArea(v)) byReason.set(v.reason, [...(byReason.get(v.reason) || []), rows[i].id]); });
  for (const [reason, ids] of byReason) {
    for (const part of chunks(ids, 150)) {
      await supabase.from('events').update({ status: 'excluded', exclusion_reason: reason, updated_at: new Date().toISOString() }).in('id', part);
    }
  }
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

async function checkSource(supabase: Db, profiles: Profiles, source: Source) {
  const reader = readerFor(source.kind);
  const result = await readSafely(reader, source.url, source.name);
  const profile = await placeProfileFor(supabase, profiles, source.topic_id);
  const { verdicts, scores } = await judgeAndScore(supabase, profiles, source.topic_id, result.events, source.url);
  const excluded = verdicts.filter(isOutOfArea).length;
  let storeError: string | null = null;
  try {
    if (result.events.length) await storeEvents(supabase, reader, source, result.events, verdicts, scores);
    else await filterStored(supabase, source, profile);
  } catch (e) { storeError = e instanceof Error ? e.message : 'Store failed'; }
  const empty = result.events.length === 0;
  await supabase.from('event_sources').update({
    last_checked_at: new Date().toISOString(),
    last_event_count: result.events.length,
    consecutive_empty_checks: empty ? (source.consecutive_empty_checks || 0) + 1 : 0,
    last_error: result.error ?? storeError,
    method: result.method ?? source.method ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', source.id);
  return { sourceId: source.id, name: source.name, kind: reader.kind, found: result.events.length - excluded, excluded, method: result.method, error: result.error ?? storeError };
}

/** found = events that reach the Desk; excluded = clearly out of area (straight to Hidden). */
const summarise = (kind: string, r: ReaderResult, verdicts: Verdict[] = []) => {
  const kept = r.events.filter((_, i) => !verdicts[i] || !isOutOfArea(verdicts[i]));
  return {
    kind,
    found: kept.length,
    excluded: r.events.length - kept.length,
    method: r.method,
    name: r.name,
    error: r.error ?? null,
    examples: kept.slice(0, 3).map((e) => ({ title: e.title, start_date: e.start_date, start_time: e.start_time, venue: e.venue })),
  };
};

// ---------- handler ----------

// ---------- reader suggestions ----------

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Suggest = Extract<z.infer<typeof Body>, { action: 'suggest' }>;

/** A reader's suggestion lands in Waiting (or Hidden if clearly out of area). Never live without the owner. */
async function suggestEvent(supabase: Db, profiles: Profiles, req: Request, b: Suggest) {
  const thanks = () => json({ success: true });
  if (b.website) return thanks(); // honeypot: pretend it worked
  const { data: settings } = await supabase.from('topic_insight_settings').select('reader_event_submissions').eq('topic_id', b.topicId).maybeSingle();
  const { data: topic } = await supabase.from('topics').select('events_enabled').eq('id', b.topicId).maybeSingle();
  if (!settings?.reader_event_submissions || !topic?.events_enabled) return json({ error: 'This feed isn’t taking suggestions right now.' }, 403);
  const today = londonToday();
  if (!suggestionDateOk(b.date, today)) return json({ error: 'Please pick a date from today up to three months ahead.' }, 422);
  const url = b.url.trim();
  if (!listingUrlOk(url) || !isPublicHttpUrl(url)) return json({ error: 'Please add a link to the full listing.' }, 422);

  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim();
  const [who, where] = await Promise.all([sha(`v:${b.visitorId}`), sha(`ip:${ip}`)]);
  const since = `${today}T00:00:00Z`;
  const count = async (pattern: string | null) => {
    let q = supabase.from('events').select('id', { count: 'exact', head: true }).eq('source_api', 'reader').gte('created_at', since);
    q = pattern ? q.like('external_id', pattern) : q.eq('topic_id', b.topicId);
    return (await q).count ?? 0;
  };
  const [byReader, byIp, byFeed] = await Promise.all([count(`${who}|%`), ip ? count(`%|${where}|%`) : Promise.resolve(0), count(null)]);
  if (byReader >= SUGGEST_PER_READER_PER_DAY || byIp >= SUGGEST_PER_READER_PER_DAY * 2 || byFeed >= SUGGEST_PER_FEED_PER_DAY) {
    return json({ error: 'Thanks – that’s plenty for today. Please try again tomorrow.' }, 429);
  }

  const ctx = await topicContextFor(supabase, profiles, b.topicId);
  const ev = { title: b.title, venue: b.venue };
  const [verdict] = judgeEvents([ev], ctx.profile, url);
  const score = combineRelevance(baseEventScore(ev, ctx.config), verdict, hasLocalEvidence(ev, ctx.profile));
  const { status, reason } = suggestionStatus(verdict);
  const { error } = await supabase.from('events').insert({
    topic_id: b.topicId, title: b.title, start_date: b.date, start_time: b.time ? `${b.time}:00` : null,
    location: b.venue, source_url: url, source_name: hostOf(url), source_api: 'reader',
    external_id: `${who}|${where}|${crypto.randomUUID()}`, event_type: 'events',
    status, exclusion_reason: reason, kept_by_owner: false, relevance_score: score,
  });
  if (error) throw error;
  return thanks();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const profiles: Profiles = new Map();

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
      for (const s of sources || []) results.push(await checkSource(supabase, profiles, s));
      console.log(`refresh_all: ${results.length} sources`, JSON.stringify(results));
      return json({ success: true, results });
    }

    if (body.action === 'suggest') return await suggestEvent(supabase, profiles, req, body);

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
      const { verdicts, scores } = await judgeAndScore(supabase, profiles, body.topicId, result.events, url);
      const summary = summarise(kind, result, verdicts);
      if (body.action === 'preview') return json({ success: true, ...summary });

      if (!result.events.length) return json({ success: false, ...summary, error: summary.error || 'No upcoming events found at this address.' }, 422);
      const name = body.name?.trim() || result.name;
      const { data: source, error } = await supabase.from('event_sources').upsert({
        topic_id: body.topicId, url, name, kind, method: result.method, is_active: true, created_by: user?.id ?? null,
        last_checked_at: new Date().toISOString(), last_event_count: result.events.length, consecutive_empty_checks: 0,
        last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'topic_id,url' }).select('*').single();
      if (error) throw error;
      await storeEvents(supabase, reader, source, result.events, verdicts, scores);
      return json({ success: true, ...summary, name, sourceId: source.id, autoPublish: Boolean(source.auto_publish) });
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
        const { verdicts, scores } = await judgeAndScore(supabase, profiles, source.topic_id, result.events, newUrl);
        if (!result.events.length) return json({ success: false, ...summarise(kind, result, verdicts), error: result.error || 'No upcoming events found at this address.' }, 422);
        await mirrorLegacyCalendarUrl(supabase, source, kind === 'calendar_feed' ? newUrl : null);
        await deleteUpcoming(supabase, source);
        const updated = { ...source, url: newUrl, kind, name: body.name || source.name };
        await supabase.from('event_sources').update({
          url: newUrl, kind, name: updated.name, method: result.method, last_checked_at: new Date().toISOString(),
          last_event_count: result.events.length, consecutive_empty_checks: 0, last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', source.id);
        await storeEvents(supabase, reader, updated, result.events, verdicts, scores);
        return json({ success: true, ...summarise(kind, result, verdicts), name: updated.name });
      }
      if (body.name && body.name !== source.name) {
        await supabase.from('event_sources').update({ name: body.name, updated_at: new Date().toISOString() }).eq('id', source.id);
        // Readers see the new name on events credited to the source itself
        await supabase.from('events').update({ source_name: body.name }).eq('event_source_id', source.id).eq('source_name', source.name);
      }
      return json({ success: true, name: body.name ?? source.name });
    }

    return json({ success: true, ...(await checkSource(supabase, profiles, source)) });
  } catch (error) {
    console.error('scrape-whats-on failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Something went wrong reading that address.' }, 500);
  }
});
