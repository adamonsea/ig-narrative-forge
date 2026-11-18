import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { parsePushRequest } from './validate.ts';

const good = {
  topicId: 'aa51af2f-2d3b-48d0-a3e3-d077c5d94fac',
  notificationType: 'weekly',
  subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', expirationTime: null, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } },
};

Deno.test('accepts a real browser subscription', () => {
  const r = parsePushRequest(good);
  assertEquals('error' in r, false);
});

Deno.test('rejects a non-https endpoint, bad topic or bad type', () => {
  assertEquals(parsePushRequest({ ...good, subscription: { ...good.subscription, endpoint: 'http://x.test/a' } }), { error: 'Invalid subscription' });
  assertEquals(parsePushRequest({ ...good, topicId: 'nope' }), { error: 'Invalid topic' });
  assertEquals(parsePushRequest({ ...good, notificationType: 'hourly' }), { error: 'Invalid notification type' });
});

Deno.test('rejects missing keys', () => {
  assertEquals(parsePushRequest({ ...good, subscription: { endpoint: good.subscription.endpoint } }), { error: 'Invalid subscription' });
});
