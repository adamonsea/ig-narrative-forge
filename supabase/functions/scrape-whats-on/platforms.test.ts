import { assertEquals } from 'jsr:@std/assert@1';
import { discoveryQueries, organiserShops, platformRootNudge, rankOrganisers, ticketShopOrigin } from './platforms.ts';

Deno.test('an organiser subdomain is a ticket shop, stored by its home address', () => {
  assertEquals(ticketShopOrigin('https://grovetheatre.onlineticketseller.com/events/163117?sid=abc'), 'https://grovetheatre.onlineticketseller.com');
  assertEquals(ticketShopOrigin('eastbournemusicfest.onlineticketseller.com'), 'https://eastbournemusicfest.onlineticketseller.com');
});

Deno.test('the platform itself is never a ticket shop', () => {
  assertEquals(ticketShopOrigin('https://www.onlineticketseller.com/'), null);
  assertEquals(ticketShopOrigin('https://onlineticketseller.com'), null);
  assertEquals(ticketShopOrigin('https://help.onlineticketseller.com'), null);
  assertEquals(ticketShopOrigin('https://grovetheatre.co.uk'), null);
});

Deno.test('pasting the platform root gets a nudge; an organiser page does not', () => {
  assertEquals(typeof platformRootNudge('www.onlineticketseller.com'), 'string');
  assertEquals(typeof platformRootNudge('https://onlineticketseller.com/events/5'), 'string');
  assertEquals(platformRootNudge('https://grovetheatre.onlineticketseller.com'), null);
  assertEquals(platformRootNudge('https://www.eastbournetheatres.co.uk/whats-on'), null);
});

Deno.test('search results become unique organiser shops', () => {
  assertEquals(organiserShops([
    'https://grovetheatre.onlineticketseller.com/events/1',
    'https://grovetheatre.onlineticketseller.com/',
    'https://www.onlineticketseller.com/pricing',
    'https://etfc.onlineticketseller.com/browse',
    'https://example.com',
  ]), ['https://grovetheatre.onlineticketseller.com', 'https://etfc.onlineticketseller.com']);
  assertEquals(discoveryQueries('Eastbourne'), ['site:onlineticketseller.com Eastbourne']);
  assertEquals(discoveryQueries('  '), []);
});

Deno.test('every organiser is offered, whether or not it names the place; search hits first', () => {
  const search = ['https://etfc.onlineticketseller.com/events/9', 'https://www.onlineticketseller.com/events/1'];
  const platform = [
    'https://winterland.onlineticketseller.com/',
    'https://grovetheatre.onlineticketseller.com/events/163117',
    'https://etfc.onlineticketseller.com/',
    'https://eastbournemusicfest.onlineticketseller.com/',
  ];
  assertEquals(rankOrganisers(search, platform, ['https://eastbournemusicfest.onlineticketseller.com']), [
    { url: 'https://etfc.onlineticketseller.com', searched: true },
    { url: 'https://grovetheatre.onlineticketseller.com', searched: false },
    { url: 'https://winterland.onlineticketseller.com', searched: false },
  ]);
});
