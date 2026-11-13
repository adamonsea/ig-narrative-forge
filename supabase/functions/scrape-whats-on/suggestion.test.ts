import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { suggestionDateOk, listingUrlOk, suggestionStatus } from './suggestion.ts';

const TODAY = '2026-11-13';
Deno.test('dates: today up to about three months ahead only', () => {
  assertEquals(suggestionDateOk('2026-11-13', TODAY), true);
  assertEquals(suggestionDateOk('2026-11-12', TODAY), false);
  assertEquals(suggestionDateOk('2027-02-13', TODAY), true);
  assertEquals(suggestionDateOk('2027-03-01', TODAY), false);
  assertEquals(suggestionDateOk('13/11/2026', TODAY), false);
});
Deno.test('a link to the full listing is required', () => {
  assertEquals(listingUrlOk('https://venue.org/show'), true);
  assertEquals(listingUrlOk('venue.org/show'), false);
  assertEquals(listingUrlOk('javascript:alert(1)'), false);
  assertEquals(listingUrlOk('http://localhost/x'), false);
  assertEquals(listingUrlOk(''), false);
});
Deno.test('never auto-publishes: Waiting, or Hidden when out of area', () => {
  assertEquals(suggestionStatus({ keep: true }).status, 'pending');
  assertEquals(suggestionStatus({ keep: false, reason: 'unconfirmed' }).status, 'pending');
  assertEquals(suggestionStatus({ keep: false, reason: 'outside_area' }), { status: 'excluded', reason: 'outside_area' });
});
