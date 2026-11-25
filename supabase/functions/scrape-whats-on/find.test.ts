import { assertEquals } from 'jsr:@std/assert@1';
import { findCandidates, findConfidence, rankFound } from './find.ts';

Deno.test('one address per site, social sites left out', () => {
  assertEquals(findCandidates(['https://facebook.com/e', 'https://a.org/whats-on', 'https://a.org/other', 'https://b.com/events']), ['https://a.org/whats-on', 'https://b.com/events']);
});
Deno.test('sources with no events are never returned', () => {
  const r = rankFound([
    { url: 'a', name: 'a', kind: 'whats_on_page', count: 0, samples: [], confidence_score: findConfidence(0) },
    { url: 'b', name: 'b', kind: 'whats_on_page', count: 2, samples: [], confidence_score: findConfidence(2) },
    { url: 'c', name: 'c', kind: 'whats_on_page', count: 9, samples: [], confidence_score: findConfidence(9) },
  ]);
  assertEquals(r.map((f) => f.url), ['c', 'b']);
});
Deno.test('confidence: 1 event is 59 (left out), 2 is 63', () => {
  assertEquals(findConfidence(1), 59);
  assertEquals(findConfidence(2), 63);
});
