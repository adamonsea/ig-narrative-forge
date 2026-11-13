import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normaliseSetup, fallbackSetup, usableColour } from './rules.ts';

Deno.test('a fandom subject gets brand-safe, plain-graphic pictures and Family-safe on', () => {
  const s = normaliseSetup({ name: 'Pokémon Today', topic_type: 'keyword', keywords: ['Pokémon', 'pokémon tcg'], brand_or_fandom: true, illustration_style: 'editorial_photographic', colour: '#E3350D' }, 'Pokémon');
  assertEquals(s.brand_or_fandom, true);
  assertEquals(s.illustration_style, 'illustrated_icon');
  assertEquals(s.family_safe, true);
  assertEquals(s.keywords, ['pokémon', 'pokémon tcg']);
});

Deno.test('a local news subject keeps Family-safe off', () => {
  const s = normaliseSetup({ name: 'Eastbourne Today', topic_type: 'regional', region: 'Eastbourne', keywords: ['eastbourne'], family_safe: false }, 'Eastbourne');
  assertEquals(s.topic_type, 'regional');
  assertEquals(s.region, 'Eastbourne');
  assertEquals(s.family_safe, false);
});

Deno.test('a regional answer without a region becomes a subject feed', () => {
  assertEquals(normaliseSetup({ topic_type: 'regional', region: '' }, 'Jazz').topic_type, 'keyword');
});

Deno.test('nothing usable from the model still gives a working feed', () => {
  const s = normaliseSetup(null, 'jazz in brighton');
  assertEquals(s, fallbackSetup('jazz in brighton'));
  assertEquals(s.name, 'Jazz In Brighton');
  assertEquals(s.family_safe, false);
});

Deno.test('near-white and near-black colours are replaced', () => {
  assertEquals(usableColour('#FFFFFF'), false);
  assertEquals(usableColour('#000000'), false);
  assertEquals(usableColour('#E3350D'), true);
  assertEquals(normaliseSetup({ colour: '#fefefe' }, 'x').colour, '#2563EB');
});
