import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { enrichEmailEvents, shortDescription } from './emailEvents.ts';

const base = { id: 'e1', title: 'Fado night', date_label: 'Thu 20 Nov', time_label: '21:00', location: 'Tasca', url: 'https://x.test' };
const topic = '11111111-1111-1111-1111-111111111111';
const opts = { supabaseUrl: 'https://abc.supabase.co', origin: 'https://curatr.pro', currency: 'EUR' };

Deno.test('a stored listing photo is used when there is one', () => {
  const [e] = enrichEmailEvents([base], [{ id: 'e1', description: null, event_type: 'music', price: null, is_free: null, image_path: `${topic}/events/${topic}.webp`, image_hidden: false, source_name: null }], opts);
  assert(e.photo_url?.startsWith('https://wsrv.nl/'));
  assert(e.photo_url?.includes('output=jpg'));
});

Deno.test('no photo (or a hidden one) falls back to the category illustration', () => {
  const [a] = enrichEmailEvents([base], [{ id: 'e1', description: null, event_type: 'music', price: null, is_free: null, image_path: null, image_hidden: false, source_name: null }], opts);
  assertEquals(a.photo_url, null);
  assert(a.art_url.startsWith('https://curatr.pro/') && a.art_url.includes('music'));
  const [b] = enrichEmailEvents([base], [{ id: 'e1', description: null, event_type: 'music', price: null, is_free: null, image_path: `${topic}/events/${topic}.webp`, image_hidden: true, source_name: null }], opts);
  assertEquals(b.photo_url, null);
});

Deno.test('unknown category uses the Other illustration and shows no label', () => {
  const [e] = enrichEmailEvents([base], [], opts);
  assert(e.art_url.includes('other'));
  assertEquals(e.category_label, null);
});

Deno.test('long descriptions are cut at a word with an ellipsis', () => {
  const d = shortDescription('word '.repeat(80), 40)!;
  assert(d.length <= 41 && d.endsWith('…'));
});

Deno.test('listing HTML never shows in the description', () => {
  assertEquals(shortDescription('<p class="x">Jewellery &amp; beauty</p>'), 'Jewellery & beauty');
  assertEquals(shortDescription('<p class="ql-align-justify brz-ff-overpass'), null);
});
