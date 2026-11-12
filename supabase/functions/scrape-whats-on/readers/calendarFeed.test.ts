import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { looksLikeCalendarFeed, calendarEvents, cleanTitle } from './calendarFeed.ts';

Deno.test('a Chamber-style events list is recognised as a calendar feed', () => {
  assertEquals(looksLikeCalendarFeed('[{"eventID":684,"display_name":"Safer","start":"2025-05-21T09:00:00","time":"x","title":"\\nEvent"'), true);
});

Deno.test('a web page or other JSON is not a calendar feed', () => {
  assertEquals(looksLikeCalendarFeed('<!doctype html><html>'), false);
  assertEquals(looksLikeCalendarFeed('[{"name":"Show","startDate":"2026-12-01"}]'), false);
  assertEquals(looksLikeCalendarFeed('{"eventID":1,"start":"x","title":"y"}'), false);
});

Deno.test('only upcoming events within 120 days are kept, with public links and member credit', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const events = calendarEvents([
    { eventID: 1, start: '2026-11-11T09:00:00', title: 'Yesterday' },
    { eventID: 2, start: '2026-11-20T18:30:00', time: 'Fri @ 18:30 - 21:00', title: '\nEvent from our member\nAcme\nNetworking breakfast', display_name: 'Acme' },
    { eventID: 3, start: '2027-06-01T09:00:00', title: 'Too far ahead' },
    { eventID: 4, start: '2026-12-01T00:00:00', allDay: true, title: 'All day fair' },
  ], 'https://members.example.co.uk/ajax_website/ajax_retrieveevents.php', now);
  assertEquals(events.map((e) => e.key), ['2', '4']);
  assertEquals(events[0].title, 'Networking breakfast');
  assertEquals(events[0].start_time, '18:30:00');
  assertEquals(events[0].end_time, '21:00:00');
  assertEquals(events[0].url, 'https://www.example.co.uk/events?id=2');
  assertEquals(events[0].source_name, 'Acme');
  assertEquals(events[1].start_time, null);
  assertEquals(events[1].source_name, 'Chamber of Commerce');
});

Deno.test('member preamble is stripped from titles', () => {
  assertEquals(cleanTitle('\nEvent from our member\nAcme Ltd\nSummer Fair'), 'Summer Fair');
});
