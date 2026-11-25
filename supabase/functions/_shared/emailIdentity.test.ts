import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normaliseEmail } from './emailIdentity.ts';

Deno.test('gmail dots and +tags collapse to one inbox', () => {
  assertEquals(normaliseEmail('A.Dam+trial@Gmail.com'), 'adam@gmail.com');
  assertEquals(normaliseEmail('adam@googlemail.com'), 'adam@gmail.com');
});
Deno.test('other domains keep dots but drop +tags', () => {
  assertEquals(normaliseEmail('a.dam+x@example.com'), 'a.dam@example.com');
});
