import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildIllustrativePrompt,
  buildSatiricalPrompt,
  COOL_FOIL,
  foilInkFor,
  NO_FRAME_RULE,
  WARM_FOIL,
  WHITE_PAPER_RULE,
} from '../prompt-helpers.ts';

// Third ink: cool feeds get a warm terracotta foil, warm feeds a cool slate-blue foil.
Deno.test('blue, teal and green feeds get the warm terracotta foil', () => {
  assertEquals(foilInkFor('#3B82F6'), WARM_FOIL);
  assertEquals(foilInkFor('#14B8A6'), WARM_FOIL);
  assertEquals(foilInkFor('#10B981'), WARM_FOIL);
});

Deno.test('red, pink, orange and yellow feeds get the cool slate-blue foil', () => {
  assertEquals(foilInkFor('#E11D48'), COOL_FOIL);
  assertEquals(foilInkFor('#EC4899'), COOL_FOIL);
  assertEquals(foilInkFor('#F97316'), COOL_FOIL);
  assertEquals(foilInkFor('#EAB308'), COOL_FOIL);
});

Deno.test('grey or missing feed colours fall back to the warm foil', () => {
  assertEquals(foilInkFor('#808080'), WARM_FOIL);
  assertEquals(foilInkFor(''), WARM_FOIL);
});

// Pictures sit on clean white paper with no frame, in every drawn variant.
Deno.test('house illustration asks for white paper, no frame and the foil ink', () => {
  for (const variant of ['current', 'handmade'] as const) {
    const p = buildIllustrativePrompt('neutral', 'a bus stop', 'Feed', '#3B82F6', undefined, null, variant);
    assert(p.includes(WHITE_PAPER_RULE), `${variant}: white paper rule`);
    assert(p.includes(NO_FRAME_RULE), `${variant}: no frame rule`);
    assert(p.includes(WARM_FOIL), `${variant}: foil ink`);
  }
});

Deno.test('satirical cartoons use white paper and no frame', () => {
  const p = buildSatiricalPrompt('SCENE: a pothole');
  assert(p.includes('clean white paper'));
  assert(!/on off-white paper/.test(p));
  assert(/Borders, frames/.test(p));
});
