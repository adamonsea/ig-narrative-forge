import { categorizeEvent } from '../_shared/eventCategories.ts';
import { factsHash } from '../_shared/editorial/caption.ts';
import { cutOff, fetchFullDescriptions } from './detailPage.ts';
import { generateEventCopy } from '../_shared/editorial/generate.ts';
import { currencyFromUrls } from '../_shared/currency.ts';
import { checkOtherCategories, inBackground } from './categoryCheck.ts';
import { placeholderImages } from './eventImage.ts';
import { cleanupPhotos, removePhotosOf, savePhotos } from './eventPhotos.ts';
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
 *   { action: 'discover', topicId, url? }                  owner: organiser ticket shop addresses for this feed (platforms.ts), unread
 *                                                          and never filtered by place; with a platform link, every shop on it
 *   { action: 'suggest', topicId, title, date, time?, venue, url, visitorId, website? }  anyone: a reader's event suggestion (Waiting only)
 *   {} or { action: 'refresh_all' }                        daily job (EVENTS_CRON_TOKEN / service role):
 *                                                          one request per source, then { action: 'photos' },
 *                                                          so no single run hits the CPU limit
 *   { action: 'photos' }                                   system only: delete past/gone photos, save new ones
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
import { discoveryQueries, platformOf, rankOrganisers, platformRootNudge, TICKET_PLATFORMS, ticketShopOrigin } from './platforms.ts';
import { firecrawlAvailable, firecrawlMap, firecrawlSearch } from './firecrawl.ts';
import type { TopicConfig } from '../_shared/hybrid-content-scoring.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const Url = z.string().url().max(2000);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), topicId: z.string().uuid(), url: Url }),
  z.object({ action: z.literal('save'), topicId: z.string().uuid(), url: Url, name: z.string().trim().max(120).optional(), kind: z.string().max(40).optional() }),
  z.object({ action: z.literal('update'), sourceId: z.string().uuid(), url: Url.optional(), name: z.string().trim().min(1).max(120).optional() }),
  z.object({ action: z.literal('refresh'), sourceId: z.string().uuid(), quiet: z.boolean().optional(), noCopy: z.boolean().optional() }),
  z.object({ action: z.literal('photos') }),
  z.object({ action: z.literal('remove'), sourceId: z.string().uuid() }),
  z.object({ action: z.literal('refresh_all') }),
  z.object({ action: z.literal('discover'), topicId: z.string().uuid(), url: Url.optional() }),
  z.object({ action: z.literal('editorial_copy'), eventId: z.string().uuid(), dryRun: z.boolean().optional(), force: z.boolean().optional(), postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
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

/**
 * Preview then Add reads the same page twice within seconds (and a double-mounted preview
 * a third time). Share one read per address for 2 minutes in this worker so the page and
 * its model pass run once, keeping the worker under its compute limit.
 */
const recentReads = new Map<string, { at: number; result: Promise<ReaderResult> }>();
function readShared(reader: EventReader, url: string, fallbackName: string): Promise<ReaderResult> {
  const key = `${reader.kind}|${url}`;
  const now = Date.now();
  for (const [k, v] of recentReads) if (now - v.at > 120_000) recentReads.delete(k);
  const hit = recentReads.get(key);
  if (hit) return hit.result;
  const result = readSafely(reader, url, fallbackName);
  recentReads.set(key, { at: now, result });
  result.then((r) => { if (r.error || !r.events.length) recentReads.delete(key); });
  return result;
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
async function judgeAndScore(supabase: Db, profiles: Profiles, topicId: string, events: ReaderEvent[], sourceUrl: string, sourceName?: string | null) {
  const ctx = await topicContextFor(supabase, profiles, topicId);
  const verdicts = judgeEvents(events, ctx.profile, sourceUrl, sourceName);
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

/** Auto-approved events: stamp approval and write their copy (skips unchanged facts and locked fields). */
async function writeEditorialCopy(supabase: Db, topicId: string, externalIds: string[]) {
  const { data } = await supabase.from('events').select('id, approved_at').eq('topic_id', topicId).in('external_id', externalIds);
  for (const ev of data || []) {
    if (!ev.approved_at) await supabase.from('events').update({ approved_at: new Date().toISOString() }).eq('id', ev.id);
    await generateEventCopy(supabase, { eventId: ev.id }).catch((e) => console.warn('editorial copy failed', ev.id, e instanceof Error ? e.message : e));
  }
}

/**
 * Captions on: when an event's key changes (the listing's own id replaces the old title/date
 * fingerprint, or the source moves to its other-language edition), the row already stored under
 * the old address keeps its id, owner decisions, edits, picture and copy instead of being
 * dropped and re-created. One row per address: approved first, then the latest.
 */
async function adoptEarlierRows(supabase: Db, reader: EventReader, source: Source, events: ReaderEvent[], ids: string[]) {
  const have = new Set<string>();
  for (const part of chunks(ids, 150)) {
    const { data } = await supabase.from('events').select('external_id').eq('topic_id', source.topic_id).eq('source_api', reader.sourceApi).in('external_id', part);
    for (const r of data || []) have.add(r.external_id);
  }
  const wanted = new Map<string, string>(); // legacy url → new id
  events.forEach((e, i) => {
    const id = ids[i]!;
    if (have.has(id)) return;
    for (const u of [e.legacy_url, e.url]) if (u && !wanted.has(u)) { wanted.set(u, id); break; }
  });
  if (!wanted.size) return;
  const today = londonToday();
  const taken = new Set<string>();
  let adopted = 0;
  for (const part of chunks([...wanted.keys()], 100)) {
    const { data } = await supabase.from('events').select('id, external_id, source_url, start_date, approved_at')
      .eq('event_source_id', source.id).in('source_url', part).gte('start_date', today);
    const best = new Map<string, { id: string; external_id: string; start_date: string; approved_at: string | null }>();
    for (const r of data || []) {
      if (ids.includes(r.external_id)) continue; // already someone's current key
      const b = best.get(r.source_url);
      if (!b || (Boolean(r.approved_at) && !b.approved_at) || (Boolean(r.approved_at) === Boolean(b.approved_at) && r.start_date > b.start_date)) best.set(r.source_url, r);
    }
    for (const [url, r] of best) {
      const id = wanted.get(url)!;
      if (taken.has(id)) continue;
      const { error } = await supabase.from('events').update({ external_id: id }).eq('id', r.id);
      if (!error) { taken.add(id); adopted++; }
    }
  }
  console.log(`adopted ${adopted} stored events under their new keys`);
}

async function storeEvents(supabase: Db, reader: EventReader, source: Source, events: ReaderEvent[], verdicts: Verdict[], scores: (number | null)[], noCopy = false, partial = false) {
  if (!events.length) return; // never wipe a source's events on an empty read
  const now = new Date().toISOString();
  // Editorial profile on: end dates are kept and hand-edited facts are locked (off = unchanged behaviour)
  const { data: profileRow } = await supabase.from('feed_editorial_profiles').select('enabled').eq('topic_id', source.topic_id).maybeSingle();
  const profileOn = Boolean(profileRow?.enabled);
  // Captions on: the listing's own record id is the key, so a daily-moving "next showing" never makes a new event
  const ids = events.map((e) => reader.externalId(source.id, profileOn && e.stable_key ? e.stable_key : e.key));
  if (profileOn) await adoptEarlierRows(supabase, reader, source, events, ids);

  // What the owner has already decided: removals and restores stick.
  const existing = new Map<string, { id: string; status: string; kept_by_owner: boolean; exclusion_reason: string | null; area_confirmed: boolean; event_type: string | null; category_locked: boolean; image_source_url: string | null; image_path: string | null; image_edited: boolean; description: string | null; description_edited: boolean; title: string; start_date: string; start_time: string | null; end_date: string | null; location: string | null; price: string | null; is_free: boolean | null; source_hash: string | null; approved_at: string | null }>();
  for (const part of chunks(ids, 150)) {
    const { data } = await supabase.from('events').select('id, external_id, status, kept_by_owner, exclusion_reason, area_confirmed, event_type, category_locked, image_source_url, image_path, image_edited, description, description_edited, title, start_date, start_time, end_date, location, price, is_free, source_hash, approved_at')
      .eq('topic_id', source.topic_id).eq('source_api', reader.sourceApi).in('external_id', part);
    for (const r of data || []) existing.set(r.external_id, r);
  }
  const removedTitles = new Set<string>();
  const keptTitles = new Set<string>();
  const confirmedTitles = new Set<string>();
  // By name across the whole feed: removing a show removes it whichever source lists it
  const { data: decided } = await supabase.from('events').select('title, status, kept_by_owner, area_confirmed')
    .eq('topic_id', source.topic_id).or('status.eq.deleted,kept_by_owner.eq.true,area_confirmed.eq.true').limit(5000);
  for (const r of decided || []) {
    if (r.area_confirmed) confirmedTitles.add(titleKey(r.title));
    if (r.status === 'deleted') removedTitles.add(titleKey(r.title));
    else if (r.kept_by_owner) keptTitles.add(titleKey(r.title));
  }

  const locks = new Map<string, Set<string>>();
  if (profileOn) {
    const prevIds = [...existing.values()].map((r) => r.id);
    for (const part of chunks(prevIds, 150)) {
      const { data } = await supabase.from('event_field_edits').select('event_id, field').in('event_id', part);
      for (const r of data || []) (locks.get(r.event_id) ?? locks.set(r.event_id, new Set()).get(r.event_id)!).add(r.field);
    }
  }

  // Spare categories (Comedy, Workshops …) the owner has added for this feed
  const { data: addedRows } = await supabase.from('topic_event_categories').select('category').eq('topic_id', source.topic_id).eq('state', 'added');
  const addedCategories = (addedRows || []).map((r: { category: string }) => r.category);

  // Venue pages often vanish once a show starts: for events in the next two days,
  // check the link and fall back to the source's listings page if it's gone.
  const dead = await deadLinks(events.filter((e) => e.url && e.url !== source.url && e.start_date <= addDays(londonToday(), 1)).map((e) => e.url!));

  // The same picture on many events is a logo or "no image" tile, not a photo
  const placeholders = placeholderImages(events.map((e) => e.image));

  // Captions on: cut-off excerpts are replaced by the event page's own full text (kept from earlier reads)
  if (profileOn) {
    const need: { url: string; excerpt: string }[] = [];
    events.forEach((e, i) => {
      if (!e.url || !e.description || !cutOff(e.description)) return;
      const prev = existing.get(ids[i]!);
      const head = e.description.replace(/(\.\.\.|…)\s*$/, '').slice(0, 60);
      if (prev?.description && !cutOff(prev.description) && prev.description.startsWith(head)) e.description = prev.description;
      else need.push({ url: e.url, excerpt: e.description });
    });
    const full = await fetchFullDescriptions(need, source.url);
    for (const e of events) if (e.url && full.has(e.url) && e.description && cutOff(e.description)) e.description = full.get(e.url)!;
    console.log(`full descriptions: ${full.size} of ${need.length} read from event pages`);
  }

  const rows = events.map((e, i) => {
    const id = ids[i];
    const prev = existing.get(id);
    const t = titleKey(e.title);
    const verdict = verdicts[i] ?? { keep: true };
    const score = scores[i] ?? null;
    const areaConfirmed = Boolean(prev?.area_confirmed) || confirmedTitles.has(t);
    const { status, reason, kept } = placeEvent({
      prev, removedByOwner: removedTitles.has(t), publishedByOwner: keptTitles.has(t),
      areaConfirmed, verdict, score, autoPublish: Boolean(source.auto_publish),
    });
    const base = {
      topic_id: source.topic_id,
      event_source_id: source.id,
      source_api: reader.sourceApi,
      external_id: id,
      title: e.title,
      // The owner's own wording sticks; otherwise the listing's
      description: prev?.description_edited ? prev.description : e.description ?? null,
      description_edited: Boolean(prev?.description_edited),
      start_date: e.start_date,
      start_time: e.start_time,
      end_time: e.end_time ?? null,
      location: e.venue,
      category: e.category ?? null,
      price: e.price ?? null,
      is_free: e.is_free ?? null,
      source_url: e.url && !dead.has(e.url) ? e.url : source.url,
      source_name: e.source_name || source.name,
      // The owner's choice sticks; otherwise rules (listing's own category, then keywords);
      // a category found earlier (rules or the background check) isn't lost to a fresh "Other"
      event_type: ((ruled) => prev?.category_locked && prev.event_type ? prev.event_type
        : ruled === 'other' && prev?.event_type && prev.event_type !== 'other' ? prev.event_type : ruled)(
        categorizeEvent({ title: e.title, description: e.description, venue: e.venue, hint: e.hint ?? e.category }, addedCategories)),
      category_locked: Boolean(prev?.category_locked),
      status,
      exclusion_reason: reason,
      kept_by_owner: kept,
      area_confirmed: areaConfirmed,
      relevance_score: score,
      image_source_url: e.image && !placeholders.has(e.image) ? e.image : null,
      source_tags: e.tags ?? [],
      updated_at: now,
    };
    if (profileOn) {
      const row = base as Record<string, unknown>;
      row.end_date = e.end_date ?? null;
      row.run_start = e.run_start ?? null;
      row.source_subtitle = e.source_subtitle ?? null;
      const locked = prev ? locks.get(prev.id) : undefined;
      if (prev && locked) {
        const keep: Record<string, string[]> = { title: ['title'], start_date: ['start_date'], start_time: ['start_time'], end_date: ['end_date'], venue: ['location'], price: ['price', 'is_free'] };
        for (const [field, cols] of Object.entries(keep)) if (locked.has(field)) for (const c of cols) row[c] = (prev as Record<string, unknown>)[c];
      }
      row.source_hash = factsHash({ ...row, description: e.description ?? null });
    }
    return base;
  });
  // One row per id (a source can repeat itself)
  const unique = [...new Map(rows.map((r) => [r.external_id, r])).values()];
  const { error } = await supabase.from('events').upsert(unique, { onConflict: 'topic_id,source_api,external_id' });
  if (error) throw new Error(error.message);
  // A listing that changed (or dropped) its picture: the old copy goes, the new one is saved next
  const changed = unique.flatMap((r) => {
    const prev = existing.get(r.external_id);
    // The owner's own picture (Edit picture) sticks, like their description
    return prev && !prev.image_edited && (prev.image_source_url ?? null) !== r.image_source_url ? [prev] : [];
  });
  if (changed.length) {
    await removePhotosOf(supabase, changed);
    for (const part of chunks(changed.map((p) => p.id), 150)) {
      await supabase.from('events').update({ image_path: null, image_status: null }).in('id', part);
    }
  }
  // A feed without a currency yet takes it from its sources' country (.pt → €, .co.uk → £)
  const currency = currencyFromUrls([source.url, ...unique.slice(0, 20).map((r) => r.source_url)]) ?? 'GBP';
  await supabase.from('topics').update({ event_currency: currency }).eq('id', source.topic_id).is('event_currency', null);
  // Editorial profile: published events that are new, newly approved or whose facts changed get fresh copy (in the background)
  if (profileOn && !noCopy) {
    // Only events starting within the feed's rolling window are written (and charged) automatically;
    // anything further out waits for the owner's approval or Regenerate.
    const { data: prof } = await supabase.from('feed_editorial_profiles').select('auto_copy_days').eq('topic_id', source.topic_id).maybeSingle();
    const days = Number(prof?.auto_copy_days ?? 14);
    const horizon = new Date(Date.parse(`${londonToday()}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const due = unique.filter((r) => {
      const prev = existing.get(r.external_id);
      return r.status === 'published' && r.start_date <= horizon && (!prev || !prev.approved_at || prev.source_hash !== (r as Record<string, unknown>).source_hash);
    }).slice(0, 25);
    if (due.length) inBackground(writeEditorialCopy(supabase, source.topic_id, due.map((r) => r.external_id)));
  }
  // Events the rules left as "Other": one model check, after this response
  inBackground(checkOtherCategories(supabase, source.topic_id, source.id));
  // Drop upcoming events from this source that it no longer lists
  const keep = unique.map((r) => `"${String(r.external_id).replace(/"/g, '')}"`).join(',');
  if (profileOn) {
    if (partial) { console.log('read stopped early: nothing dropped'); return; }
    // Compared here, not in one long query: a few hundred keys overflow the request address
    const keepIds = new Set(unique.map((r) => String(r.external_id)));
    const { data: upcoming } = await supabase.from('events').select('id, external_id, image_path, image_original_path')
      .eq('event_source_id', source.id).gte('start_date', londonToday()).limit(5000);
    const gone = (upcoming || []).filter((r: { external_id: string }) => !keepIds.has(r.external_id));
    await removePhotosOf(supabase, gone.filter((r: { image_path: string | null }) => r.image_path));
    for (const part of chunks(gone.map((r: { id: string }) => r.id), 150)) await supabase.from('events').delete().in('id', part);
    return;
  }
  const { data: dropped } = await supabase.from('events').select('image_path, image_original_path')
    .eq('event_source_id', source.id).gte('start_date', londonToday())
    .not('external_id', 'in', `(${keep})`).not('image_path', 'is', null);
  await removePhotosOf(supabase, dropped);
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
    .eq('event_source_id', source.id).eq('status', 'published').eq('kept_by_owner', false).eq('area_confirmed', false)
    .gte('start_date', londonToday()).limit(1000);
  const rows = (data || []) as { id: string; title: string; location: string | null }[];
  if (!rows.length) return;
  const verdicts = judgeEvents(rows.map((r) => ({ title: r.title, venue: r.location })), profile, source.url, source.name);
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
  const { data: withPhotos } = await supabase.from('events').select('image_path, image_original_path')
    .eq('event_source_id', source.id).gte('start_date', today).not('image_path', 'is', null);
  await removePhotosOf(supabase, withPhotos);
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

/** Save this source's new photos after the response (the daily run does all feeds at once instead). */
const photosLater = (supabase: Db, sourceId: string) =>
  inBackground(savePhotos(supabase, { sourceId }).catch((e) => console.warn('event photos failed:', e instanceof Error ? e.message : e)));

async function checkSource(supabase: Db, profiles: Profiles, source: Source, photos = true, noCopy = false) {
  const reader = readerFor(source.kind);
  const result = await readSafely(reader, source.url, source.name);
  const profile = await placeProfileFor(supabase, profiles, source.topic_id);
  const { verdicts, scores } = await judgeAndScore(supabase, profiles, source.topic_id, result.events, source.url, source.name);
  const excluded = verdicts.filter(isOutOfArea).length;
  let storeError: string | null = null;
  try {
    if (result.events.length) {
      await storeEvents(supabase, reader, source, result.events, verdicts, scores, noCopy, Boolean(result.partial));
      if (photos) photosLater(supabase, source.id);
    } else await filterStored(supabase, source, profile);
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

/** The value that turns up most often (first wins a tie), or null. */
function mostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v?.trim()) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)!) best = v;
  return best;
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
    venue: mostCommon(r.events.map((e) => e.venue)),
    examples: kept.slice(0, 3).map((e) => ({ title: e.title, start_date: e.start_date, start_time: e.start_time, venue: e.venue })),
  };
};

// ---------- finding organiser ticket shops ----------

const DISCOVER_MAX = 12;
const DISCOVER_MAX_PASTED = 40;

/**
 * Organiser shops on ticketing platforms for this feed, as a list of addresses (nothing read
 * here, nothing left out for its location): the Add source sheet previews each one so the
 * owner sees its name, venue and events and picks the local ones. With a platform link, every
 * shop on that platform; otherwise only shops a search for the feed's place or subject finds.
 */
async function discoverShops(supabase: Db, topicId: string, url?: string) {
  if (!firecrawlAvailable()) return [];
  const { data: topic } = await supabase.from('topics').select('name, region, topic_type').eq('id', topicId).maybeSingle();
  if (!topic) return [];
  const term = topic.topic_type === 'regional' && topic.region ? topic.region : topic.name;
  const pasted = url ? platformOf(url) : null;
  const platforms = pasted ? [pasted] : TICKET_PLATFORMS;
  const [searchLinks, platformLinks] = await Promise.all([
    Promise.all(discoveryQueries(term || '', platforms).map((q) => firecrawlSearch(q, 20))).then((l) => l.flat()),
    pasted ? Promise.all(platforms.map((p) => firecrawlMap(`https://www.${p.domain}`))).then((l) => l.flat()) : Promise.resolve([] as string[]),
  ]);
  const { data: existing } = await supabase.from('event_sources').select('url, name').eq('topic_id', topicId);
  const mine = new Map<string, string>();
  for (const r of (existing || []) as { url: string; name: string }[]) { const o = ticketShopOrigin(r.url); if (o) mine.set(o, r.name); }
  const own = url ? ticketShopOrigin(url) : null;
  const ranked = rankOrganisers(searchLinks, platformLinks, own ? [own] : [], (pasted ? DISCOVER_MAX_PASTED : DISCOVER_MAX) + mine.size);
  // Ones this feed already has are listed last as added, so nothing looks missing
  return [
    ...ranked.filter((o) => !mine.has(o.url)).map((o) => ({ url: o.url, name: hostOf(o.url).split('.')[0], added: false })),
    ...ranked.filter((o) => mine.has(o.url)).map((o) => ({ url: o.url, name: mine.get(o.url)!, added: true })),
  ];
}

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
    external_id: `${who}|${where}|${crypto.randomUUID()}`, event_type: 'other',
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
      const { data: sources, error } = await supabase.from('event_sources').select('id').eq('is_active', true).order('last_checked_at', { ascending: true, nullsFirst: true }).limit(60);
      if (error) throw error;
      // Each source is read in its own request (its own CPU budget); photos run last, also on their own
      const self = `${Deno.env.get('SUPABASE_URL')}/functions/v1/scrape-whats-on`;
      const call = (payload: Record<string, unknown>) => fetch(self, {
        method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.text().catch(() => '') })).catch((e) => ({ ok: false, status: 0, body: String(e) }));
      const ids = (sources || []).map((s: { id: string }) => s.id);
      inBackground((async () => {
        const failed: string[] = [];
        for (let i = 0; i < ids.length; i += 2) {
          const out = await Promise.all(ids.slice(i, i + 2).map((id: string) => call({ action: 'refresh', sourceId: id, quiet: true })));
          out.forEach((o, j) => { if (!o.ok) failed.push(`${ids[i + j]}:${o.status}`); });
        }
        console.log(`refresh_all: ${ids.length} sources, ${failed.length} failed`, failed.join(' '));
        const photos = await call({ action: 'photos' });
        console.log('refresh_all photos:', photos.status, photos.body.slice(0, 300));
      })());
      return json({ success: true, queued: ids.length });
    }

    if (body.action === 'photos') {
      if (!isSystem) return json({ error: 'Unauthorized' }, 401);
      // Delete what's past or gone (every feed with photos or event sources), then save new ones
      const [{ data: withPhotos }, { data: withSources }] = await Promise.all([
        supabase.from('events').select('topic_id').not('image_path', 'is', null).limit(5000),
        supabase.from('event_sources').select('topic_id').limit(1000),
      ]);
      const topicIds = [...(withSources || []), ...(withPhotos || [])].map((r: { topic_id: string }) => r.topic_id);
      const removed = await cleanupPhotos(supabase, topicIds);
      const saved = await savePhotos(supabase, { limit: 60 });
      return json({ success: true, removed, saved });
    }

    if (body.action === 'suggest') return await suggestEvent(supabase, profiles, req, body);

    // Everything else needs the feed's owner
    const user = isSystem ? null : await getUser(req);
    if (!isSystem && !user) return json({ error: 'Please sign in' }, 401);

    if (body.action === 'editorial_copy') {
      const { data: ev } = await supabase.from('events').select('topic_id').eq('id', body.eventId).maybeSingle();
      if (!ev) return json({ error: 'Not found' }, 404);
      if (!isSystem && !(await userOwnsTopic(supabase, user!.id, ev.topic_id))) return json({ error: 'Not your feed' }, 403);
      const result = await generateEventCopy(supabase, { eventId: body.eventId, dryRun: body.dryRun, force: body.force, postDate: body.postDate });
      // Out of credits is an expected outcome (approval writes run in the background), not a failure
      return json(result, result.error && result.error !== 'Not enough credits' ? 400 : 200);
    }

    if (body.action === 'discover') {
      if (!isSystem && !(await userOwnsTopic(supabase, user!.id, body.topicId))) return json({ error: 'Not your feed' }, 403);
      return json({ success: true, suggestions: await discoverShops(supabase, body.topicId, body.url) });
    }

    if (body.action === 'preview' || body.action === 'save') {
      if (!isSystem && !(await userOwnsTopic(supabase, user!.id, body.topicId))) return json({ error: 'Not your feed' }, 403);
      const pasted = body.url.trim();
      const nudge = platformRootNudge(pasted);
      if (nudge) return json({ success: false, kind: 'whats_on_page', found: 0, error: nudge, examples: [] }, body.action === 'save' ? 422 : 200);
      if (!isPublicHttpUrl(pasted)) return json({ success: false, kind: 'whats_on_page', found: 0, error: 'That address can’t be read.', examples: [] }, body.action === 'save' ? 422 : 200);
      const detected = body.action === 'save' && isEventSourceKind(body.kind) ? body.kind : await detectKind(pasted);
      // A ticket shop is stored by its home address, whichever of its pages was pasted
      const shop = ticketShopOrigin(pasted);
      const kind = shop ? 'ticket_shop' : detected;
      const url = shop ?? pasted;
      const reader = readerFor(kind);
      const result = await readShared(reader, url, hostOf(url));
      const { verdicts, scores } = await judgeAndScore(supabase, profiles, body.topicId, result.events, url, ("name" in body ? body.name : undefined) || result.name);
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
      photosLater(supabase, source.id);
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
      const typed = body.url?.trim();
      const nudge = typed ? platformRootNudge(typed) : null;
      if (nudge) return json({ error: nudge }, 422);
      const newUrl = typed ? (ticketShopOrigin(typed) ?? typed) : typed;
      if (newUrl && newUrl !== source.url) {
        if (!isPublicHttpUrl(newUrl)) return json({ error: 'That address can’t be read.' }, 422);
        const { data: clash } = await supabase.from('event_sources').select('id').eq('topic_id', source.topic_id).eq('url', newUrl).neq('id', source.id).maybeSingle();
        if (clash) return json({ error: 'That address is already in your list.' }, 409);
        const kind = await detectKind(newUrl);
        const reader = readerFor(kind);
        const result = await readSafely(reader, newUrl, hostOf(newUrl));
        const { verdicts, scores } = await judgeAndScore(supabase, profiles, source.topic_id, result.events, newUrl, body.name || source.name);
        if (!result.events.length) return json({ success: false, ...summarise(kind, result, verdicts), error: result.error || 'No upcoming events found at this address.' }, 422);
        await mirrorLegacyCalendarUrl(supabase, source, kind === 'calendar_feed' ? newUrl : null);
        // Captions on: stored events are carried over to the new address (adopted by link), not wiped
        const { data: prof } = await supabase.from('feed_editorial_profiles').select('enabled').eq('topic_id', source.topic_id).maybeSingle();
        if (!prof?.enabled) await deleteUpcoming(supabase, source);
        const updated = { ...source, url: newUrl, kind, name: body.name || source.name };
        await supabase.from('event_sources').update({
          url: newUrl, kind, name: updated.name, method: result.method, last_checked_at: new Date().toISOString(),
          last_event_count: result.events.length, consecutive_empty_checks: 0, last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', source.id);
        await storeEvents(supabase, reader, updated, result.events, verdicts, scores);
        photosLater(supabase, source.id);
        return json({ success: true, ...summarise(kind, result, verdicts), name: updated.name });
      }
      if (body.name && body.name !== source.name) {
        await supabase.from('event_sources').update({ name: body.name, updated_at: new Date().toISOString() }).eq('id', source.id);
        // Readers see the new name on events credited to the source itself
        await supabase.from('events').update({ source_name: body.name }).eq('event_source_id', source.id).eq('source_name', source.name);
      }
      return json({ success: true, name: body.name ?? source.name });
    }

    // The daily run saves photos once at the end instead of per source
    const quiet = isSystem && 'quiet' in body && body.quiet === true;
    // System-only trial gathers can skip writing copy (no credits)
    const noCopy = isSystem && 'noCopy' in body && body.noCopy === true;
    return json({ success: true, ...(await checkSource(supabase, profiles, source, !quiet, noCopy)) });
  } catch (error) {
    console.error('scrape-whats-on failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Something went wrong reading that address.' }, 500);
  }
});
