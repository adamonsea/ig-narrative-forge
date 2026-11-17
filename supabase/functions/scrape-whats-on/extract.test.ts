import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseDateText, parseTimeText, parseIsoLike, verifyTextCandidates, extractJsonLdEvents, parseIcs,
  robotsAllows, upcomingUnique, findCalendarFeedLinks, parseJsonFeed,
} from './extract.ts';

const TODAY = '2026-11-12'; // a Thursday

Deno.test('date written without a year resolves to the next occurrence', () => {
  assertEquals(parseDateText('Fri 4 Dec', TODAY), '2026-12-04');
  assertEquals(parseDateText('3 March', TODAY), '2027-03-03');
  assertEquals(parseDateText('December 4th', TODAY), '2026-12-04');
});

Deno.test('a weekday that disagrees with the date drops the event', () => {
  assertEquals(parseDateText('Thu 4 Dec', TODAY), null); // 4 Dec 2026 is a Friday, 2027 a Saturday
  assertEquals(parseDateText('Saturday 4th December 2027', TODAY), '2027-12-04');
  assertEquals(parseDateText('Sunday 4th December 2027', TODAY), null);
});

Deno.test('full, numeric and range dates', () => {
  assertEquals(parseDateText('20 November 2026', TODAY), '2026-11-20');
  assertEquals(parseDateText('04/12/2026', TODAY), '2026-12-04'); // UK order
  assertEquals(parseDateText('4 – 6 Dec 2026', TODAY), '2026-12-04');
  assertEquals(parseDateText('Today', TODAY), null);
  assertEquals(parseDateText('Ongoing', TODAY), null);
});

Deno.test('times', () => {
  assertEquals(parseTimeText('7.30pm'), '19:30:00');
  assertEquals(parseTimeText('7-10pm'), '19:00:00');
  assertEquals(parseTimeText('10:30AM - 5PM'), '10:30:00');
  assertEquals(parseTimeText('19:30'), '19:30:00');
  assertEquals(parseTimeText('From 5PM'), '17:00:00');
});

Deno.test('ISO dates keep the venue wall-clock time; Z converts to London', () => {
  assertEquals(parseIsoLike('2026-12-04T19:30:00+00:00'), { date: '2026-12-04', time: '19:30:00' });
  assertEquals(parseIsoLike('2026-07-04T18:30:00Z'), { date: '2026-07-04', time: '19:30:00' });
  assertEquals(parseIsoLike('2026-12-04'), { date: '2026-12-04', time: null });
  assertEquals(parseIsoLike('next Friday'), null);
});

Deno.test('text fallback keeps only events whose date text is on the page next to the title', () => {
  const page = 'What\'s on\nThe Nutcracker\nFri 4 Dec 7.30pm\nMain hall\nJazz Night\nComing soon';
  const out = verifyTextCandidates([
    { title: 'The Nutcracker', date_text: 'Fri 4 Dec', time_text: '7.30pm', venue: 'Main hall' },
    { title: 'Jazz Night', date_text: 'Sat 5 Dec', time_text: null, venue: null }, // date not on page
    { title: 'Panto', date_text: 'Fri 4 Dec', time_text: null, venue: null }, // title not on page
    { title: 'The Nutcracker', date_text: 'Fri 4 Dec', time_text: '8pm', venue: 'Elsewhere' }, // time/venue not on page
  ], page, 'https://example.org/whats-on', TODAY);
  assertEquals(out.length, 2);
  assertEquals(out[0], { title: 'The Nutcracker', start_date: '2026-12-04', start_time: '19:30:00', venue: 'Main hall', url: 'https://example.org/whats-on' });
  assertEquals(out[1].start_time, null);
  assertEquals(out[1].venue, null);
});

Deno.test('a date far away from the title is not used', () => {
  const page = `Sat 14 Nov ${'filler text '.repeat(400)} Late Show`;
  assertEquals(verifyTextCandidates([{ title: 'Late Show', date_text: 'Sat 14 Nov' }], page, 'https://x.org', TODAY).length, 0);
});

Deno.test('JSON-LD events, including nested graphs and subtype names', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"TheaterEvent","name":"Panto &amp; Fun","startDate":"2026-12-10T14:00:00+00:00","location":{"name":"Royal Hippodrome"},"url":"/panto"},{"@type":"Organization","name":"x"}]}</script>`;
  assertEquals(extractJsonLdEvents(html, 'https://venue.org/whats-on'), [
    { title: 'Panto & Fun', start_date: '2026-12-10', start_time: '14:00:00', venue: 'Royal Hippodrome', url: 'https://venue.org/panto', place: 'Royal Hippodrome', online: false, description: null, price: null, is_free: null, hint: 'TheaterEvent' },
  ]);
});

Deno.test('JSON-LD price and description, never guessed', () => {
  const html = `<script type="application/ld+json">[{"@type":"MusicEvent","name":"Fado night","startDate":"2026-12-10T21:00","description":"<p>Fado in an old tavern.</p>","offers":{"price":"15","priceCurrency":"EUR"}},{"@type":"Event","name":"Open day","startDate":"2026-12-11","isAccessibleForFree":true}]</script>`;
  const [a, b] = extractJsonLdEvents(html, 'https://x.pt/');
  assertEquals([a.price, a.is_free, a.description], ['€15', false, 'Fado in an old tavern.']);
  assertEquals([b.price, b.is_free], [null, true]);
});

Deno.test('JSON-LD address and online-only events feed the location check', () => {
  const html = `<script type="application/ld+json">[{"@type":"Event","name":"Board games","startDate":"2026-12-10T19:00","location":{"@type":"Place","name":"The Dice Box","address":{"streetAddress":"12 Grove Rd","addressLocality":"Eastbourne","postalCode":"BN21 4TX"}}},{"@type":"Event","name":"Talk","startDate":"2026-12-11T19:00","eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode","location":{"@type":"VirtualLocation","url":"https://zoom.us/x"}}]</script>`;
  const [a, b] = extractJsonLdEvents(html, 'https://x.org/');
  assertEquals(a.place, 'The Dice Box, 12 Grove Rd, Eastbourne, BN21 4TX');
  assertEquals(a.online, false);
  assertEquals(b.venue, null);
  assertEquals(b.online, true);
});

Deno.test('iCal feeds', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Choir\\, festive\r\nDTSTART;TZID=Europe/London:20261212T173000\r\nLOCATION:St Saviour\'s\\, Eastbourne\r\nURL:https://x.org/e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Cancelled thing\r\nSTATUS:CANCELLED\r\nDTSTART;VALUE=DATE:20261213\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assertEquals(parseIcs(ics, 'https://x.org/cal.ics'), [
    { title: 'Choir, festive', start_date: '2026-12-12', start_time: '17:30:00', venue: "St Saviour's", url: 'https://x.org/e/1', place: "St Saviour's, Eastbourne" },
  ]);
  assertEquals(findCalendarFeedLinks('<a href="webcal://x.org/a.ics">Add</a><a href="/musical/show">Show</a>', 'https://x.org/'), ['https://x.org/a.ics']);
});

Deno.test('robots.txt', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/events\n\nUser-agent: CuratrEvents\nDisallow: /';
  assertEquals(robotsAllows(robots, 'https://x.org/whats-on', 'curatrevents'), false);
  assertEquals(robotsAllows(robots, 'https://x.org/private/a', 'otherbot'), false);
  assertEquals(robotsAllows(robots, 'https://x.org/private/events', 'otherbot'), true);
  assertEquals(robotsAllows(null, 'https://x.org/whats-on'), true);
  assertEquals(robotsAllows('<html>not found</html>', 'https://x.org/whats-on'), true);
});

Deno.test('past events are dropped and repeats collapse', () => {
  const e = (d: string) => ({ title: 'Show', start_date: d, start_time: null, venue: null, url: null });
  assertEquals(upcomingUnique([e('2026-11-11'), e('2026-11-20'), e('2026-11-20')], TODAY).map((x) => x.start_date), ['2026-11-20']);
});

Deno.test('European month names are read, with or without accents and "de"', () => {
  assertEquals(parseDateText('18 novembro 2026', TODAY), '2026-11-18');
  assertEquals(parseDateText('18 de novembro de 2026', TODAY), '2026-11-18');
  assertEquals(parseDateText('3 março', TODAY), '2027-03-03');
  assertEquals(parseDateText('12 décembre 2026', TODAY), '2026-12-12');
  assertEquals(parseDateText('18. November 2026', TODAY), '2026-11-18');
  assertEquals(parseDateText('5 diciembre', TODAY), '2026-12-05');
  assertEquals(parseDateText('4 dicembre 2026', TODAY), '2026-12-04');
});

Deno.test('a European weekday must agree with the date too', () => {
  assertEquals(parseDateText('sexta-feira, 4 dezembro 2026', TODAY), '2026-12-04'); // a Friday
  assertEquals(parseDateText('sábado, 4 dezembro 2026', TODAY), null);
});

Deno.test('everyday English words are never read as months', () => {
  assertEquals(parseDateText('4 out of 5', TODAY), null);
  assertEquals(parseDateText('2 set menus', TODAY), null);
});

Deno.test('a range takes its year from the end date, never next year by mistake', () => {
  assertEquals(parseDateText('3 novembro a 18 dezembro 2026', TODAY), '2026-11-03');
  assertEquals(parseDateText('20 December to 6 January 2027', TODAY), '2026-12-20');
});

Deno.test('venue names come from slug-keyed maps, and start-only lists ignore publish dates', () => {
  const items = [
    { title: { rendered: 'Fado na Mouraria' }, StartDate: '2026-12-01', link: 'https://x.pt/e/1',
      venue: { 'casa-do-fado': { id: 1, slug: 'casa-do-fado', name: 'Casa do Fado' } } },
    { title: { rendered: 'Blog post' }, date: '2026-12-02T10:00:00', link: 'https://x.pt/p/2' },
  ];
  const ev = parseJsonFeed(items, 'https://x.pt/', null, { startOnly: true });
  assertEquals(ev.length, 1);
  assertEquals(ev[0].venue, 'Casa do Fado');
  assertEquals(ev[0].start_date, '2026-12-01');
});

Deno.test('Agenda LX serialised price values are read as the listing wrote them', async () => {
  const { listedPriceValue } = await import('./extract.ts');
  assertEquals(listedPriceValue('a:1:{i:0;a:2:{s:5:"value";s:1:"4";s:11:"description";s:27:"(entry ticket not included)";}}'), '4');
  assertEquals(listedPriceValue('a:1:{i:0;a:1:{s:5:"value";s:12:"15 € to 20";}}'), '15 € to 20');
  assertEquals(listedPriceValue(''), undefined);
  const events = parseJsonFeed([{ title: 'Fado night', StartDate: '2030-01-10', price_cat: 'value', price_val: 'a:1:{i:0;a:1:{s:5:"value";s:2:"12";}}' }], 'https://x.pt/', null, { startOnly: true });
  assertEquals(events[0].price, '12');
  assertEquals(events[0].is_free, false);
});
