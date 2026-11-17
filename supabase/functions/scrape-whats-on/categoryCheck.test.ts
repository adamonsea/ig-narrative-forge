import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { allowedCategories, readAnswers } from './categoryCheck.ts';

Deno.test('only the feed\'s own categories are accepted from the model', () => {
  const allowed = allowedCategories([]);
  const a = readAnswers('{"results":[{"i":0,"category":"music"},{"i":1,"category":"comedy"},{"i":2,"category":"Film"},{"i":9,"category":"sport"}]}', 3, allowed);
  assertEquals([...a.entries()], [[0, 'music'], [2, 'film']]);
});

Deno.test('spare categories count once the feed has added them', () => {
  const a = readAnswers('{"results":[{"i":0,"category":"comedy"}]}', 1, allowedCategories(['comedy']));
  assertEquals(a.get(0), 'comedy');
});

Deno.test('"other" and broken answers leave events as they are', () => {
  assertEquals(readAnswers('{"results":[{"i":0,"category":"other"}]}', 1, allowedCategories([])).size, 0);
  assertEquals(readAnswers('not json', 1, allowedCategories([])).size, 0);
  assertEquals(readAnswers('```json\n[{"i":0,"category":"markets"}]\n```', 1, allowedCategories([])).get(0), 'markets');
});
