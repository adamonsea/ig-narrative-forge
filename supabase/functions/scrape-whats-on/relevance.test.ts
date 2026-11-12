import { assertEquals } from 'jsr:@std/assert@1';
import { baseEventScore, combineRelevance, placeEvent, LOW_RELEVANCE } from './relevance.ts';
import { buildPlaceProfile, judgeEvents, hasLocalEvidence } from './locality.ts';

const topic = {
  id: 't', topic_type: 'regional' as const, region: 'Eastbourne', keywords: ['eastbourne'],
  landmarks: ['Congress Theatre', 'Towner Art Gallery'], postcodes: ['BN21', 'BN22', 'BN23'], organizations: [],
  competing_regions: ['worthing', 'crawley'],
};
const profile = buildPlaceProfile(topic);
const EB = 'https://www.eventbrite.co.uk/d/united-kingdom--eastbourne/events';
const LOCAL = 'https://townereastbourne.org.uk/whats-on';

const scoreOf = (ev: { title: string; venue: string | null; online?: boolean }, url: string) => {
  const [v] = judgeEvents([ev], profile, url);
  return { v, score: combineRelevance(baseEventScore(ev, topic), v, hasLocalEvidence(ev, profile)) };
};

Deno.test('a local venue scores high, an online talk from Canada is out of area and low', () => {
  const local = scoreOf({ title: 'Bill Bailey', venue: 'Congress Theatre, Eastbourne' }, LOCAL);
  const walrus = scoreOf({ title: 'The Walrus Talks at Home: Canada After America', venue: null, online: true }, EB);
  assertEquals(local.v.keep, true);
  assertEquals((local.score ?? 0) >= 60, true);
  assertEquals(walrus.v, { keep: false, reason: 'online' });
  assertEquals((walrus.score ?? 100) <= 5, true);
});

Deno.test('nothing to go on from a broad listings site ranks low but still waits', () => {
  const r = scoreOf({ title: 'Pier fireworks', venue: 'Palace Pier, Brighton' }, EB);
  assertEquals((r.score ?? 100) < LOW_RELEVANCE, true);
  assertEquals(placeEvent({ verdict: r.v, score: r.score, autoPublish: true }).status, 'pending');
});

Deno.test('subject feeds are not scored', () => {
  assertEquals(baseEventScore({ title: 'x', venue: null }, { ...topic, topic_type: 'keyword', region: undefined } as any), null);
});

Deno.test('new events: auto-publish sources go Live, others wait, out of area is hidden', () => {
  const keep = { keep: true } as const;
  assertEquals(placeEvent({ verdict: keep, score: 70, autoPublish: true }).status, 'published');
  assertEquals(placeEvent({ verdict: keep, score: 70, autoPublish: false }).status, 'pending');
  assertEquals(placeEvent({ verdict: { keep: false, reason: 'outside_area' }, score: 3, autoPublish: true }), { status: 'excluded', reason: 'outside_area', kept: false });
  assertEquals(placeEvent({ verdict: keep, score: null, autoPublish: true }).status, 'published');
});

Deno.test('owner decisions and what is already placed stick', () => {
  const keep = { keep: true } as const;
  assertEquals(placeEvent({ prev: { status: 'deleted', kept_by_owner: false }, verdict: keep, score: 90, autoPublish: true }).status, 'deleted');
  assertEquals(placeEvent({ removedByOwner: true, verdict: keep, score: 90, autoPublish: true }).status, 'deleted');
  assertEquals(placeEvent({ prev: { status: 'pending', kept_by_owner: false }, verdict: keep, score: 90, autoPublish: true }).status, 'pending');
  assertEquals(placeEvent({ prev: { status: 'published', kept_by_owner: true }, verdict: { keep: false, reason: 'outside_area' }, score: 1, autoPublish: false }).status, 'published');
  assertEquals(placeEvent({ prev: { status: 'published', kept_by_owner: false }, verdict: { keep: false, reason: 'outside_area' }, score: 1, autoPublish: true }).status, 'excluded');
  assertEquals(placeEvent({ publishedByOwner: true, verdict: { keep: false, reason: 'online' }, score: 1, autoPublish: false }).status, 'published');
});
