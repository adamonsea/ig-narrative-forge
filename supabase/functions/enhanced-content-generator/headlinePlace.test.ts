import { assert, assertEquals } from 'jsr:@std/assert@1';
import { headlinePlaceEditRule, headlinePlaceRule } from './headlinePlace.ts';

Deno.test('local feeds leave their own town out of headlines and name other places', () => {
  const rule = headlinePlaceRule('regional', 'Eastbourne');
  assert(rule.includes('do NOT put "Eastbourne" in the headline'));
  assert(rule.includes('DO name that place'));
  assert(headlinePlaceEditRule('regional', 'Eastbourne').includes('Keep any other place name'));
});

Deno.test('subject feeds, or local feeds without a place, get no place rule', () => {
  assertEquals(headlinePlaceRule('keyword', 'Eastbourne'), '');
  assertEquals(headlinePlaceRule('regional', '  '), '');
  assertEquals(headlinePlaceEditRule(null, 'Lisbon'), '');
});
