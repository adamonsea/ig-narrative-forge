/**
 * Location filter for events on place-based feeds. Pure rules (no network,
 * no database, no model) so every decision is explainable and testable.
 *
 * Checked in this order, first match wins:
 *   1. Online / virtual                         → left out ("online")
 *   2. A full UK postcode in the place text     → in if its district is one of the feed's (or a
 *                                                 neighbouring one and the address names the area), else out
 *   3. Names one of the feed's competing areas  → out
 *   4. Names the feed's own area or places      → in
 *   5. Nothing to go on: trusted from a source that only lists local things,
 *      left out ("unconfirmed") when the source is a broad listings site or
 *      clearly lists other areas too.
 *
 * Feeds that aren't about a place get no filtering at all.
 */

export type ExclusionReason = 'online' | 'outside_area' | 'unconfirmed';

export interface PlaceProfile {
  region: string;
  places: string[]; // normalised, the feed's own area names
  districts: string[]; // postcode districts, upper case, e.g. BN21
  competing: string[]; // normalised
}

export interface LocalityInput {
  title: string;
  venue: string | null;
  /** Fuller address text when the source gave one (not stored). */
  place?: string | null;
  online?: boolean;
}

export type Verdict = { keep: true } | { keep: false; reason: ExclusionReason };

const norm = (s: string) => ` ${s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Landmark words too generic to prove a place on their own (every town has a pier or a station). */
const GENERIC = new Set([
  'pier', 'prom', 'promenade', 'downs', 'south downs', 'town hall', 'old town', 'high street', 'station', 'railway station',
  'beach', 'seafront', 'harbour', 'library', 'cathedral', 'church', 'park', 'market', 'town centre', 'city centre', 'bandstand',
]);

interface TopicLike {
  topic_type?: string | null;
  region?: string | null;
  landmarks?: string[] | null;
  postcodes?: string[] | null;
  organizations?: string[] | null;
  competing_regions?: string[] | null;
}

/** null = not a place-based feed, so nothing is filtered. */
export function buildPlaceProfile(topic: TopicLike | null | undefined): PlaceProfile | null {
  if (!topic || topic.topic_type !== 'regional') return null;
  const region = (topic.region || '').trim();
  if (!region) return null;
  const places = new Set<string>();
  const add = (s: string | null | undefined) => {
    const t = norm(s || '').trim();
    if (t.length >= 4 && !GENERIC.has(t)) places.add(t);
  };
  add(region);
  (topic.landmarks || []).forEach(add);
  (topic.organizations || []).forEach((o) => add((o || '').replace(/\(.*?\)/g, '')));
  const districts = (topic.postcodes || [])
    .map((p) => (p || '').toUpperCase().replace(/\s+/g, ''))
    .filter((p) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(p));
  const competing = (topic.competing_regions || []).map((c) => norm(c || '').trim()).filter((c) => c.length >= 3);
  return { region, places: [...places], districts, competing };
}

const LISTINGS_HOSTS = [
  'eventbrite.', 'ticketmaster.', 'meetup.com', 'skiddle.com', 'allevents.in', 'seetickets.', 'dice.fm', 'fatsoma.com',
  'designmynight.com', 'ticketsource.', 'billetto.', 'eventim.', 'atgtickets.com', 'gigantic.com', 'songkick.com',
  'bandsintown.com', 'facebook.com', 'ents24.com', 'list.co.uk', 'timeout.com', 'eventfinda.', 'patchwork', 'wegottickets.com',
];

/** Sites that list events from many places, so an event without a place can't be assumed local. */
export function isBroadListingSite(url: string): boolean {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return LISTINGS_HOSTS.some((h) => host.includes(h));
}

const ONLINE = /\b(online|webinar|virtual|zoom|livestream(ed)?|live stream|teams meeting|google meet|on demand)\b/i;
const FULL_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/gi;

const has = (hay: string, needle: string) => hay.includes(` ${needle} `);

/** The explicit signals only (rules 1–4); null when there is nothing to go on. */
function explicitVerdict(ev: LocalityInput, p: PlaceProfile): Verdict | null {
  const placeText = [ev.venue, ev.place].filter(Boolean).join(' , ');
  if (ev.online || (placeText && ONLINE.test(placeText)) || (!placeText && ONLINE.test(ev.title))) {
    return { keep: false, reason: 'online' };
  }
  const placeN = norm(placeText);
  if (p.districts.length && placeText) {
    const found = [...placeText.matchAll(FULL_POSTCODE)].map((m) => m[1].toUpperCase());
    if (found.length) {
      if (found.some((d) => p.districts.includes(d))) return { keep: true };
      // A neighbouring district the feed didn't list (e.g. BN20 for a BN21–BN25 town) still
      // counts when the address itself names the feed's own area.
      const area = (d: string) => d.replace(/\d.*$/, '');
      const sameArea = found.some((d) => p.districts.some((own) => area(own) === area(d)));
      return sameArea && p.places.some((pl) => has(placeN, pl)) ? { keep: true } : { keep: false, reason: 'outside_area' };
    }
  }
  const allN = norm(`${ev.title} ${placeText}`);
  if (placeText && p.competing.some((c) => has(placeN, c))) return { keep: false, reason: 'outside_area' };
  if (p.places.some((pl) => has(allN, pl))) return { keep: true };
  if (p.districts.some((d) => has(allN, d.toLowerCase()))) return { keep: true };
  if (!placeText && p.competing.some((c) => has(allN, c))) return { keep: false, reason: 'outside_area' };
  return null;
}

/** True when the event's own place text or title names the feed's area (rules 2–4 said "in"). */
export function hasLocalEvidence(ev: LocalityInput, profile: PlaceProfile | null): boolean {
  return profile ? explicitVerdict(ev, profile)?.keep === true : false;
}

/**
 * Judge every event from one read of one source. A source counts as broad when
 * it's a known listings site, or when at least two of its events (and a quarter
 * of them) are clearly somewhere else.
 */
export function judgeEvents(events: LocalityInput[], profile: PlaceProfile | null, sourceUrl: string): Verdict[] {
  if (!profile) return events.map(() => ({ keep: true }));
  const explicit = events.map((e) => explicitVerdict(e, profile));
  const elsewhere = explicit.filter((v) => v && !v.keep && v.reason === 'outside_area').length;
  const broad = isBroadListingSite(sourceUrl) || (elsewhere >= 2 && elsewhere / Math.max(1, events.length) >= 0.25);
  return explicit.map((v) => {
    if (v) return v;
    if (!broad) return { keep: true };
    return { keep: false, reason: 'unconfirmed' };
  });
}
