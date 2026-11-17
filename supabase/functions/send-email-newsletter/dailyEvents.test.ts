import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickDailyEvents, dailyEventsHeading, londonToday, type WhatsOnRow } from './dailyEvents.ts';

const row = (id: string, start_date: string, start_time: string | null = null): WhatsOnRow => ({
  id, title: `Event ${id}`, start_date, start_time, location: 'Venue', source_url: 'https://v.example/e', source_name: 'Venue site',
});
const TODAY = '2026-11-17';

Deno.test('daily email only includes events today or tomorrow', () => {
  const picked = pickDailyEvents([
    row('today', '2026-11-17', '19:30:00'),
    row('tomorrow', '2026-11-18'),
    row('dayAfter', '2026-11-19', '10:00:00'),
    row('nextWeek', '2026-11-24'),
  ], TODAY);
  assertEquals(picked.map((e) => e.id), ['today', 'tomorrow']);
  assertEquals(picked.map((e) => e.date_label), ['Today', 'Tomorrow']);
});

Deno.test('soonest first, untimed after timed, at most 3 per day so tomorrow always gets room', () => {
  const picked = pickDailyEvents([
    row('t-untimed', '2026-11-18'),
    row('t-evening', '2026-11-18', '20:00:00'),
    row('a', '2026-11-17', '18:00:00'),
    row('b', '2026-11-17', '12:00:00'),
    row('d', '2026-11-17'),
    row('e', '2026-11-17', '21:00:00'),
    row('c', '2026-11-18', '09:00:00'),
  ], TODAY);
  assertEquals(picked.map((e) => e.id), ['b', 'a', 'e', 'c', 't-evening', 't-untimed']);
});

Deno.test('no events in the next two days means no block', () => {
  assertEquals(pickDailyEvents([row('later', '2026-11-20')], TODAY), []);
});

Deno.test('tomorrow wraps across month end', () => {
  assertEquals(pickDailyEvents([row('dec1', '2026-12-01')], '2026-11-30').map((e) => e.date_label), ['Tomorrow']);
});

Deno.test('heading names only the days shown', () => {
  assertEquals(dailyEventsHeading(pickDailyEvents([row('x', '2026-11-18')], TODAY)), "What's on tomorrow");
  assertEquals(dailyEventsHeading(pickDailyEvents([row('x', '2026-11-17'), row('y', '2026-11-18')], TODAY)), "What's on today & tomorrow");
});

Deno.test('UK date is used, not UTC (just after midnight in summer)', () => {
  assertEquals(londonToday(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
});
