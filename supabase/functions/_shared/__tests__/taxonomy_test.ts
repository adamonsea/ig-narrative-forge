import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { usesGlobalTaxonomy } from '../taxonomy.ts';

// The shared global categories are a local-news set (courts, council, planning…).
Deno.test('regional feeds use the shared local-news categories', () => {
  assertEquals(usesGlobalTaxonomy('regional'), true);
});

Deno.test('subject (keyword) feeds do not get the local-news categories', () => {
  assertEquals(usesGlobalTaxonomy('keyword'), false);
  assertEquals(usesGlobalTaxonomy(null), false);
});
