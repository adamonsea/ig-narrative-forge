import { assertEquals } from 'jsr:@std/assert@1';
import { buildPlaceProfile, judgeEvents, isBroadListingSite } from './locality.ts';

const eastbourne = buildPlaceProfile({
  topic_type: 'regional',
  region: 'Eastbourne',
  landmarks: ['pier', 'Congress Theatre', 'Towner Art Gallery', 'Devonshire Park Theatre', 'Sovereign Harbour'],
  postcodes: ['BN21', 'BN22', 'BN23', 'bn24', 'bn25'],
  organizations: ['Eastbourne District General Hospital (DGH)'],
  competing_regions: ['crawley', 'worthing', 'west sussex', 'horsham', 'chichester'],
});
const EB = 'https://www.eventbrite.co.uk/d/united-kingdom--eastbourne/events';
const LOCAL = 'https://townereastbourne.org.uk/whats-on';
const keep = { keep: true };

Deno.test('subject feeds are never filtered', () => {
  const p = buildPlaceProfile({ topic_type: 'keyword', region: null });
  assertEquals(judgeEvents([{ title: 'Webinar', venue: null, online: true }], p, EB), [keep]);
});

Deno.test('online events are left out', () => {
  assertEquals(judgeEvents([{ title: 'HBR Book Webinar: Unspeakable', venue: null }], eastbourne, LOCAL), [{ keep: false, reason: 'online' }]);
  assertEquals(judgeEvents([{ title: 'The Walrus Talks', venue: null, online: true }], eastbourne, LOCAL), [{ keep: false, reason: 'online' }]);
});

Deno.test('a full postcode decides', () => {
  const v = judgeEvents([
    { title: 'Light Fantastic!', venue: 'Kingston Parish Hall, The Street, Kingston, East Sussex, BN7 3PB' },
    { title: 'Towner Christmas Fair', venue: 'Towner Eastbourne, College Road, Eastbourne BN21 4JJ' },
    { title: 'Eastbourne Road fair', venue: 'Eastbourne Road, Uckfield TN22 1AA' },
  ], eastbourne, LOCAL);
  assertEquals(v, [{ keep: false, reason: 'outside_area' }, keep, { keep: false, reason: 'outside_area' }]);
});

Deno.test('a neighbouring district counts only when the address names the area', () => {
  const v = judgeEvents([
    { title: 'Christmas Lunch', venue: 'Hydro Hotel Eastbourne', place: 'Hydro Hotel Eastbourne, Mount Road, Eastbourne, BN20 7HZ' },
    { title: 'Open Morning', venue: 'Pashley Down Infant School', place: 'Pashley Down Infant School, Eastbourne, BN20 8EZ' },
    { title: 'Panto', venue: 'Village Hall', place: 'Village Hall, Kingston, BN7 3NT' },
  ], eastbourne, EB);
  assertEquals(v, [keep, keep, { keep: false, reason: 'outside_area' }]);
});

Deno.test('competing areas are out, own places are in', () => {
  const v = judgeEvents([
    { title: 'Quiz night', venue: 'The Crown, Worthing' },
    { title: 'Bill Bailey', venue: 'Congress Theatre' },
    { title: 'Exclusive Christmas Chocolate Event - Eastbourne', venue: 'Hotel Chocolat' },
  ], eastbourne, LOCAL);
  assertEquals(v, [{ keep: false, reason: 'outside_area' }, keep, keep]);
});

Deno.test('generic landmark words alone do not prove a place', () => {
  assertEquals(judgeEvents([{ title: 'Pier fireworks', venue: 'Palace Pier, Brighton' }], eastbourne, EB), [{ keep: false, reason: 'unconfirmed' }]);
});

Deno.test('a local source is trusted when there is nothing to go on', () => {
  assertEquals(judgeEvents([{ title: 'The Ravilious Collection', venue: null }, { title: 'Wicker', venue: 'Studio 2' }], eastbourne, LOCAL), [keep, keep]);
});

Deno.test('a broad listings site is not trusted without a place', () => {
  const v = judgeEvents([
    { title: 'Lean Global Connection 2026', venue: null },
    { title: 'Board Games', venue: 'The Dice Box', place: 'The Dice Box, 12 Grove Road, Eastbourne' },
    { title: 'Social Board Gaming', venue: 'BN21 4TX' },
    { title: 'Yoga', venue: 'The Yoga Life studio' },
  ], eastbourne, EB);
  assertEquals(v, [{ keep: false, reason: 'unconfirmed' }, keep, keep, { keep: false, reason: 'unconfirmed' }]);
});

Deno.test('a source that clearly lists other areas loses trust for unplaced events', () => {
  const v = judgeEvents([
    { title: 'A', venue: 'Hall, Kingston BN7 3PB' },
    { title: 'B', venue: 'Showground, Ardingly RH17 6TL' },
    { title: 'C', venue: 'Towner Eastbourne, BN21 4JJ' },
    { title: 'D', venue: null },
  ], eastbourne, 'https://thefamilygrapevine.co.uk/eastbourne-wealden-lewes/events/');
  assertEquals(v[3], { keep: false, reason: 'unconfirmed' });
  assertEquals(v[2], keep);
});

Deno.test('listings hosts', () => {
  assertEquals(isBroadListingSite(EB), true);
  assertEquals(isBroadListingSite(LOCAL), false);
});
