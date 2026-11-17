import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findDataEndpoints, siteScriptUrls, inlineScripts, wpRestBase, wpEventLists } from './pageData.ts';
import { parseJsonFeed, upcomingUnique } from './extract.ts';

const PAGE = 'https://brightoncentre.co.uk/whats-on/';

Deno.test('finds the data address a listings script builds from a base path', () => {
  const script = `var _urlbase = '/Umbraco/Api/Events/';
    $.ajax.post({ url: _urlbase + 'Find', data: { _Meta: true } });
    $.depends('register', { chain: ['/ajax-loader.aspx?view=CalendarViewer.Views.Tile'] });`;
  assertEquals(findDataEndpoints([script], '<html></html>', PAGE), ['https://brightoncentre.co.uk/Umbraco/Api/Events/Find']);
});

Deno.test('never picks other sites, files, or addresses that record or sign up', () => {
  const script = `
    fetch('https://other.example.com/api/events');
    load('/scripts/CalendarViewer.js');
    post('/api/newsletter/subscribe-events');
    post('/api/tracking/events');
    get('/api/events/upcoming');`;
  assertEquals(findDataEndpoints([script], '', PAGE), ['https://brightoncentre.co.uk/api/events/upcoming']);
});

Deno.test('WordPress sites running The Events Calendar get its standard listings address', () => {
  const html = '<link rel="https://api.w.org/" href="/wp-json/"><link href="/wp-content/plugins/the-events-calendar/x.css">';
  assertEquals(findDataEndpoints([], html, 'https://village.example.org/events/'), [
    'https://village.example.org/wp-json/tribe/events/v1/events?per_page=50',
  ]);
});

Deno.test('only the site\'s own scripts are read, CDN libraries skipped', () => {
  const html = `<script src="//cdnjs.cloudflare.com/knockout.js"></script>
    <script src="/scripts/jquery.cookie.js"></script>
    <script src="/scripts/BrightonCentre/Search.js"></script>
    <script src="/scripts/BrightonCentre/CalendarViewer-Models.js"></script>
    <script>var x = 1;</script><script type="application/ld+json">{"a":1}</script>`;
  assertEquals(siteScriptUrls(html, PAGE), [
    'https://brightoncentre.co.uk/scripts/BrightonCentre/Search.js',
    'https://brightoncentre.co.uk/scripts/BrightonCentre/CalendarViewer-Models.js',
  ]);
  assertEquals(inlineScripts(html).trim(), 'var x = 1;');
});

Deno.test('events nested by month are read, with the display name and event page', () => {
  const data = {
    Meta: { Total: 3, Example: { Name: 'Example', EventDates: { EventDate: '2026-11-16T00:00:00' } } },
    Data: [
      { Month: 11, MonthName: 'November', Events: [
        { Name: 'Ricky Gervais', EventNameOverride: '', Url: '/whats-on/2026/ricky-gervais/', EventTime: null,
          EventDates: { EventDate: '2026-11-16T00:00:00', AdditionalDates: [] } },
        { Name: 'Skye Newman', Url: '/whats-on/2026/skye-newman/', EventTime: '7.30pm',
          EventDates: { EventDate: '2026-11-18T00:00:00' } },
      ] },
      { Month: 12, MonthName: 'December', Events: [
        { Name: 'Bill Bailey (1)', EventNameOverride: 'Bill Bailey', Url: '/whats-on/2026/bill-bailey-1/',
          EventDates: { EventDate: '2026-12-01T00:00:00' } },
      ] },
    ],
  };
  const events = upcomingUnique(parseJsonFeed(data, PAGE, 'Brighton Centre'), '2026-11-16', 90);
  assertEquals(events.map((e) => [e.title, e.start_date, e.start_time, e.url, e.place]), [
    ['Ricky Gervais', '2026-11-16', null, 'https://brightoncentre.co.uk/whats-on/2026/ricky-gervais/', 'Brighton Centre'],
    ['Skye Newman', '2026-11-18', '19:30:00', 'https://brightoncentre.co.uk/whats-on/2026/skye-newman/', 'Brighton Centre'],
    ['Bill Bailey', '2026-12-01', null, 'https://brightoncentre.co.uk/whats-on/2026/bill-bailey-1/', 'Brighton Centre'],
  ]);
});

Deno.test('a list that is mostly not events (e.g. months or menus) is not read as events', () => {
  const data = { menu: [{ name: 'Home', date: '2026-11-20' }, { name: 'About' }, { name: 'Contact' }, { name: 'Shop' }] };
  assertEquals(parseJsonFeed(data, PAGE), []);
});

Deno.test('dates are only taken from real date fields, never guessed from text', () => {
  const data = { events: [{ title: 'Quiz night', date: 'Every Thursday' }, { title: 'Jazz', start: { dateTime: '2026-11-20T19:30:00+00:00' } }] };
  assertEquals(parseJsonFeed(data, PAGE).map((e) => [e.title, e.start_date, e.start_time]), [['Jazz', '2026-11-20', '19:30:00']]);
});

Deno.test('a WordPress site\'s own events list is found from its data index', () => {
  const html = '<link rel=https://api.w.org/ href=https://www.agendalx.pt/wp-json/ >';
  const base = wpRestBase(html, 'https://www.agendalx.pt/?lang=en');
  assertEquals(base, 'https://www.agendalx.pt/wp-json/');
  const routes = ['/', '/wp/v2/event', '/agendalx/v1', '/agendalx/v1/events', '/agendalx/v1/events/(?P<id>[\\d]+)', '/agendalx/v1/venues', '/wpml/v1/capture/event'];
  assertEquals(wpEventLists(routes, base!, 'https://www.agendalx.pt/?lang=en'), [
    'https://www.agendalx.pt/wp-json/agendalx/v1/events?per_page=50&lang=en',
  ]);
});

Deno.test('another site\'s data index is never used', () => {
  assertEquals(wpRestBase('<link rel="https://api.w.org/" href="https://other.example.com/wp-json/">', 'https://www.agendalx.pt/'), null);
});
