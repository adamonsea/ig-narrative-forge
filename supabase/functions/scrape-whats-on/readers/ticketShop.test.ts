import { assertEquals } from 'jsr:@std/assert@1';
import { hasEventLists, nextShopPage, shopEvents, shopName, shopPageData, stripSid } from './ticketShop.ts';

const ORIGIN = 'https://grovetheatre.onlineticketseller.com';
const ev = (over: Record<string, unknown>) => ({
  id: 1, name: 'Treasure Island', start_datetime: '2026-12-03 19:30:00', end_datetime: '2026-12-03 22:00:00',
  status_slug: 'published', is_cancelled: false, is_past: false, url: `${ORIGIN}/events/1?sid=xyz`,
  description: '<p>A piratical&nbsp;adventure</p>', venue: { name: 'The Grove Theatre', address_full: 'Grove Road, Eastbourne, BN21 4TL' },
  settings: { is_online_only: false, is_hidden: 0 }, images: { card_thumbnail: { url: 'https://assets.example.com/a-thumb.jpg?sid=1' } },
  ...over,
});
const page = (events: unknown[], next: string | null = null) => {
  const data = { component: 'shop::event-listings/show', props: { company: { name: 'The Grove Theatre' }, blocks: [{ block: { matching_events: { data: events, links: [{ url: next, label: 'Next' }] } } }] } };
  const attr = JSON.stringify(data).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<html><body><div id="app" data-page="${attr}"></div></body></html>`;
};

Deno.test('reads the shop page data from the HTML attribute', () => {
  const data = shopPageData(page([ev({})]))!;
  assertEquals(shopName(data, ORIGIN), 'The Grove Theatre');
  assertEquals(shopPageData('<html>Just a moment...</html>'), null);
});

Deno.test('keeps the stated date, time, venue, link and picture, without visit tokens', () => {
  const [e] = shopEvents(shopPageData(page([ev({})]))!, ORIGIN, '2026-11-18');
  assertEquals(e.key, '1');
  assertEquals(e.start_date, '2026-12-03');
  assertEquals(e.start_time, '19:30:00');
  assertEquals(e.end_time, '22:00:00');
  assertEquals(e.venue, 'The Grove Theatre');
  assertEquals(e.place, 'Grove Road, Eastbourne, BN21 4TL');
  assertEquals(e.url, `${ORIGIN}/events/1`);
  assertEquals(e.image, 'https://assets.example.com/a-thumb.jpg');
  assertEquals(e.description, 'A piratical adventure');
  assertEquals(e.price, null);
});

Deno.test('leaves out past, cancelled, hidden, unpublished and far-off events', () => {
  const data = shopPageData(page([
    ev({ id: 2, start_datetime: '2026-08-04 15:00:00' }), // season ticket that started in August
    ev({ id: 3, is_cancelled: true }),
    ev({ id: 4, settings: { is_hidden: 1 } }),
    ev({ id: 5, status_slug: 'draft' }),
    ev({ id: 6, start_datetime: '2027-06-01 19:00:00' }),
    ev({ id: 7, start_datetime: '2026-11-18 00:00:00' }),
  ]))!;
  const out = shopEvents(data, ORIGIN, '2026-11-18');
  assertEquals(out.map((e) => e.key), ['7']);
  assertEquals(out[0].start_time, null); // midnight = no stated time
});

Deno.test('follows the next page only on the same shop', () => {
  assertEquals(nextShopPage(shopPageData(page([ev({})], `${ORIGIN}/?page=2`))!, ORIGIN), `${ORIGIN}/?page=2`);
  assertEquals(nextShopPage(shopPageData(page([ev({})], 'https://evil.example/?page=2'))!, ORIGIN), null);
  assertEquals(nextShopPage(shopPageData(page([ev({})]))!, ORIGIN), null);
  assertEquals(stripSid('http://x.example/a?sid=1&b=2'), 'https://x.example/a?b=2');
});

Deno.test('an empty listing still counts as the shop\'s list, so /browse is skipped', () => {
  assertEquals(hasEventLists(shopPageData(page([]))!), true);
  assertEquals(hasEventLists({ props: { blocks: [{ block: { title: 'Subscribe' } }] } }), false);
});
