import { assertEquals } from 'jsr:@std/assert@1';
import { englishEdition, mergeEnglishEdition } from './translations.ts';
import { listedTimes, runStart, parseJsonFeed } from './extract.ts';
import { fullDescriptionFrom } from './detailPage.ts';

Deno.test('englishEdition: Portuguese page linking ?lang=en', () => {
  assertEquals(englishEdition('<html class=no-js lang=pt-PT><a href="https://www.agendalx.pt/?lang=en">en</a>'), true);
  assertEquals(englishEdition('<html lang="en-GB"><a href="?lang=en">'), false);
  assertEquals(englishEdition('<html lang=pt-PT>'), true);
  assertEquals(englishEdition('<html>'), false);
});

Deno.test('listedTimes: one time only', () => {
  assertEquals(listedTimes('qua: 20h'), '20:00:00');
  assertEquals(listedTimes('15h00'), '15:00:00');
  assertEquals(listedTimes('qua: 19h30; qui: 19h30'), '19:30:00');
  assertEquals(listedTimes('sex: 21h; sáb: 21h30'), null);
  assertEquals(listedTimes('vários horários'), null);
  assertEquals(listedTimes(''), null);
});

Deno.test('runStart: first day of the current run, older seasons ignored', () => {
  assertEquals(runStart(['2018-11-06', '2018-11-29', '2026-11-03', '2026-11-04', '2026-11-24', '2026-12-18'], '2026-11-24'), '2026-11-03');
  assertEquals(runStart(['2026-11-24'], '2026-11-24'), null);
});

Deno.test('Agenda LX item: time from string_times, run start, record id', () => {
  const [e] = parseJsonFeed([{ id: 245491, title: { rendered: 'Gold Mother' }, StartDate: '2026-11-25', LastDate: '2026-11-26', string_times: 'qua: 19h30; qui: 19h30', occurences: ['2026-11-25', '2026-11-26'], link: 'https://www.agendalx.pt/events/event/gold-mother/' }], 'https://www.agendalx.pt/', null, { startOnly: true });
  assertEquals([e!.start_time, e!.end_date, e!.source_id, e!.run_start ?? null], ['19:30:00', '2026-11-26', '245491', null]);
  const [x] = parseJsonFeed([{ id: 239625, title: { rendered: 'Era Uma Vez na América' }, StartDate: '2026-11-24', LastDate: '2027-05-30', string_times: 'vários horários', occurences: ['2026-07-04', '2026-08-20', '2026-10-10', '2026-11-24'] }], 'https://www.agendalx.pt/', null, { startOnly: true });
  assertEquals([x!.start_time, x!.run_start], [null, '2026-07-04']);
});

const ev = (o: Record<string, unknown>) => ({ title: 'x', start_date: '2026-11-24', start_time: null, venue: 'V', url: null, ...o }) as never;

Deno.test('mergeEnglishEdition: strict match gives the English title; repeats dropped; the rest kept', () => {
  const pt = [ev({ title: 'Era Uma Vez na América', image: 'https://a/img.png', venue: 'Pavilhão Julião Sarmento', end_date: '2027-05-30', url: 'pt1' }),
    ev({ title: 'Câmara Escura', image: 'https://a/cam.jpg', venue: 'Castelo de São Jorge', url: 'pt2' })];
  const en = [ev({ title: 'Once Upon a Time in America', image: 'https://a/img.png', venue: 'Pavilhão Julião Sarmento', end_date: '2027-05-30', url: 'en1' }),
    ev({ title: 'Discovering the Castle', image: 'https://a/castle.jpg', venue: 'Castelo de São Jorge', url: 'en2' }),
    ev({ title: 'Camera Obscura', image: 'https://a/cam-1.jpg', venue: 'Castelo de São Jorge', url: 'en3' })];
  const r = mergeEnglishEdition(pt, en);
  assertEquals([r.matched, r.dropped, r.kept], [1, 1, 1]);
  assertEquals(r.events[0]!.alt_title, 'Once Upon a Time in America');
  assertEquals(r.events[0]!.alt_url, 'en1');
  assertEquals(r.events[2]!.title, 'Discovering the Castle');
});

Deno.test('fullDescriptionFrom: entry paragraphs before credits, same opening as the excerpt', () => {
  const html = '<div class=entry-container><p>Uma das cantoras <em>líricas</em> mais conceituadas.</p><p>Segundo parágrafo.</p><div class=event__extra-info><p>Voz</p></div>';
  assertEquals(fullDescriptionFrom(html, 'Uma das cantoras líricas mais...'), 'Uma das cantoras líricas mais conceituadas.\n\nSegundo parágrafo.');
  assertEquals(fullDescriptionFrom(html, 'Outro evento completamente...'), null);
});
