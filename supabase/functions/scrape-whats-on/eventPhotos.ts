/**
 * Saving and deleting event photos (network side; the rules are in eventImage.ts).
 * A photo is fetched once, checked, shrunk to 800px wide by Supabase's image service
 * and stored as Curatr's own copy in topic-assets/{topic}/events/{event}.webp, so cards
 * never depend on the venue's site. Copies are deleted the day after the event ends,
 * when the event goes or is removed, when the owner picks the illustration, and by a
 * sweep of anything left over. All of it runs inside the twice-daily gather.
 */
import { londonToday } from './extract.ts';
import { allowedByRobots } from './read.ts';
import { imageSize, judgeImage, MAX_IMAGE_BYTES, photoFolder, photoPath } from './eventImage.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
const BUCKET = 'topic-assets';
const WIDTH = 800;
const UA = 'Mozilla/5.0 (compatible; CuratrEvents/1.0)';

async function removeFiles(supabase: Db, paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(list.slice(i, i + 100));
    if (error) console.warn('event photos: remove failed', error.message);
  }
  return list.length;
}

/** Delete the stored photos of rows about to be deleted (pass the same filters as the delete). */
export async function removePhotosOf(supabase: Db, rows: { image_path: string | null; image_original_path?: string | null }[] | null | undefined) {
  return removeFiles(supabase, (rows || []).flatMap((r) => [r.image_path, r.image_original_path ?? null]));
}

async function saveOne(supabase: Db, ev: { id: string; topic_id: string; image_source_url: string }): Promise<string> {
  const mark = (image_status: string, image_path: string | null = null) =>
    supabase.from('events').update({ image_status, image_path }).eq('id', ev.id);
  const src = ev.image_source_url;
  if (!(await allowedByRobots(src).catch(() => false))) { await mark('rejected:robots'); return 'robots'; }
  let res: Response;
  try {
    res = await fetch(src, { headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png,image/webp' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch { await mark('rejected:fetch'); return 'fetch'; }
  const type = res.headers.get('content-type') || '';
  const declared = Number(res.headers.get('content-length') || 0);
  if (!res.ok || declared > MAX_IMAGE_BYTES) { await res.body?.cancel(); await mark(`rejected:${res.ok ? 'size' : res.status}`); return 'http'; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const size = imageSize(bytes);
  const verdict = judgeImage({ type, bytes: bytes.byteLength, width: size?.width, height: size?.height });
  if (!verdict.ok) { await mark(`rejected:${verdict.reason}`); return verdict.reason; }

  const path = photoPath(ev.topic_id, ev.id);
  const original = `${path}.orig`;
  const store = supabase.storage.from(BUCKET);
  const up = await store.upload(original, bytes, { contentType: type.split(';')[0], upsert: true, cacheControl: '60' });
  if (up.error) { console.warn('event photos: upload failed', up.error.message); return 'upload'; } // retried next gather
  // Shrink with Supabase's image service, then keep only the small copy
  let final: Uint8Array = bytes;
  let finalType = type.split(';')[0];
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/storage/v1/render/image/public/${BUCKET}/${original}?width=${Math.min(WIDTH, size!.width)}&quality=75`;
    const r = await fetch(url, { headers: { Accept: 'image/webp' }, signal: AbortSignal.timeout(20_000) }); // WebP: smallest copy
    if (r.ok) { final = new Uint8Array(await r.arrayBuffer()); finalType = r.headers.get('content-type')?.split(';')[0] || 'image/webp'; }
    else await r.body?.cancel();
  } catch { /* keep the original if it's light enough */ }
  if (final === bytes && bytes.byteLength > 1_500_000) { await removeFiles(supabase, [original]); await mark('rejected:shrink'); return 'shrink'; }
  const done = await store.upload(path, final, { contentType: finalType, upsert: true, cacheControl: '604800' });
  await removeFiles(supabase, [original]);
  if (done.error) { console.warn('event photos: upload failed', done.error.message); return 'upload'; }
  await mark('saved', path);
  return 'saved';
}

/**
 * Save photos still waiting (Waiting or Live, upcoming, not swapped for the illustration).
 * Capped per run so a gather never times out; the rest are picked up next time.
 */
/** Photos only appear on individual event cards (chosen, or the events-led default). */
const INDIVIDUAL_CARDS = 'event_cards.eq.individual,and(feed_lead.eq.events,event_cards.is.null)';
const showsPhotos = (t: { event_photos_enabled?: boolean | null; event_cards?: string | null; feed_lead?: string | null } | null) =>
  Boolean(t && t.event_photos_enabled !== false && (t.event_cards === 'individual' || (t.feed_lead === 'events' && !t.event_cards)));

export async function savePhotos(supabase: Db, opts: { sourceId?: string; limit?: number } = {}) {
  const today = londonToday();
  let q = supabase.from('events').select('id, topic_id, image_source_url, topics!inner(event_photos_enabled)')
    .not('image_source_url', 'is', null).is('image_path', null).is('image_status', null).eq('image_hidden', false)
    .in('status', ['published', 'pending']).or(`start_date.gte.${today},end_date.gte.${today}`)
    .eq('topics.event_photos_enabled', true).or(INDIVIDUAL_CARDS, { referencedTable: 'topics' })
    .order('start_date').limit(opts.limit ?? 40);
  if (opts.sourceId) q = q.eq('event_source_id', opts.sourceId);
  const { data, error } = await q;
  if (error) { console.warn('event photos: list failed', error.message); return {}; }
  const todo = (data || []) as { id: string; topic_id: string; image_source_url: string }[];
  const tally: Record<string, number> = {};
  for (let i = 0; i < todo.length; i += 4) {
    const results = await Promise.all(todo.slice(i, i + 4).map((ev) => saveOne(supabase, ev).catch(() => 'error')));
    for (const r of results) tally[r] = (tally[r] || 0) + 1;
  }
  if (todo.length) console.log('event photos saved:', JSON.stringify(tally));
  return tally;
}

/**
 * Delete photos that should go: the event has ended, the owner swapped it for the
 * illustration, or it was removed. Then sweep each feed's folder for files that no
 * longer belong to an event (left by deletes, changed photos or interrupted saves).
 */
export async function cleanupPhotos(supabase: Db, topicIds: string[]) {
  const today = londonToday();
  let removed = 0;
  const { data: gone } = await supabase.from('events').select('id, image_path, image_original_path')
    .not('image_path', 'is', null)
    .or(`image_hidden.eq.true,status.eq.deleted,status.eq.excluded,and(start_date.lt.${today},or(end_date.is.null,end_date.lt.${today}))`)
    .limit(1000);
  const rows = (gone || []) as { id: string; image_path: string; image_original_path: string | null }[];
  if (rows.length) {
    removed += await removePhotosOf(supabase, rows);
    for (let i = 0; i < rows.length; i += 150) {
      await supabase.from('events').update({ image_path: null, image_status: null, image_original_path: null, image_framing: null }).in('id', rows.slice(i, i + 150).map((r) => r.id));
    }
  }
  // Feeds that turned photos off or show grouped cards: delete their copies too
  // (owner-edited pictures stay: they also make the event's social poster)
  const { data: withTopic } = await supabase.from('events').select('id, image_path, topics!inner(event_photos_enabled, event_cards, feed_lead)')
    .not('image_path', 'is', null).eq('image_edited', false).limit(2000);
  const offRows = ((withTopic || []) as { id: string; image_path: string; topics: Parameters<typeof showsPhotos>[0] }[])
    .filter((r) => !showsPhotos(r.topics));
  if (offRows.length) {
    removed += await removeFiles(supabase, offRows.map((r) => r.image_path));
    for (let i = 0; i < offRows.length; i += 150) {
      await supabase.from('events').update({ image_path: null, image_status: null }).in('id', offRows.slice(i, i + 150).map((r) => r.id));
    }
  }

  const hourAgo = Date.now() - 60 * 60 * 1000;
  for (const topicId of [...new Set(topicIds)]) {
    const folder = photoFolder(topicId);
    const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
    const list = (files || []) as { name: string; created_at?: string }[];
    if (!list.length) continue;
    const idOf = (n: string) => n.replace(/\.(jpg|webp)(\.orig)?$/, '').replace(/-(v|src)\d+$/, '');
    const ids = [...new Set(list.map((f) => idOf(f.name)))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const live = new Set<string>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await supabase.from('events').select('image_path, image_original_path').in('id', ids.slice(i, i + 150)).not('image_path', 'is', null);
      for (const r of data || []) { live.add(r.image_path); if (r.image_original_path) live.add(r.image_original_path); }
    }
    const stray = list.filter((f) => {
      const path = `${folder}/${f.name}`;
      if (f.name.endsWith('.orig')) return !f.created_at || Date.parse(f.created_at) < hourAgo; // interrupted saves only
      return !live.has(path);
    }).map((f) => `${folder}/${f.name}`);
    removed += await removeFiles(supabase, stray);
  }
  if (removed) console.log(`event photos removed: ${removed}`);
  return removed;
}
