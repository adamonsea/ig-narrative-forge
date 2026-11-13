import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { familySafeVerdict } from '../family-safe.ts';

Deno.test('ordinary fandom stories pass', () => {
  assertEquals(familySafeVerdict('New Pokémon card set revealed', 'Collectors can battle with the new deck.').safe, true);
  assertEquals(familySafeVerdict('Pikachu event at the Brighton Centre', 'A family day out with trading and games.').safe, true);
});

Deno.test('place names that contain blocked letters are not caught', () => {
  assertEquals(familySafeVerdict('Sussex and Essex schools join tournament', '').safe, true);
});

Deno.test('adult content is filtered', () => {
  const v = familySafeVerdict('Star leaks nude photos', '');
  assertEquals(v.safe, false);
  assertEquals(v.category, 'adult');
});

Deno.test('graphic violence is filtered', () => {
  const v = familySafeVerdict('Man stabbed outside game shop', '');
  assertEquals(v.safe, false);
  assertEquals(v.category, 'violence');
});

Deno.test('gambling is filtered, including in the body', () => {
  const v = familySafeVerdict('Card prices soar', 'Fans are using casino style betting apps to win packs.');
  assertEquals(v.safe, false);
  assertEquals(v.category, 'gambling');
});

Deno.test('hyphenated and spaced phrases both match', () => {
  assertEquals(familySafeVerdict('Charity warns on self harm', '').safe, false);
});
