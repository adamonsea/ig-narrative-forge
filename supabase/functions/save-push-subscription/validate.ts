/** Pure checks for a browser push sign-up (tested in validate.test.ts). */
export type PushType = 'instant' | 'daily' | 'weekly';

export interface PushRequest {
  topicId: string;
  notificationType: PushType;
  subscription: { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_\-=+/]{8,200}$/;

/** Returns the cleaned request, or an error sentence. */
export function parsePushRequest(body: unknown): PushRequest | { error: string } {
  const b = (body ?? {}) as Record<string, any>;
  if (typeof b.topicId !== 'string' || !UUID.test(b.topicId)) return { error: 'Invalid topic' };
  const type = b.notificationType ?? 'weekly';
  if (!['instant', 'daily', 'weekly'].includes(type)) return { error: 'Invalid notification type' };
  const s = b.subscription ?? {};
  let url: URL;
  try { url = new URL(String(s.endpoint ?? '')); } catch { return { error: 'Invalid subscription' }; }
  if (url.protocol !== 'https:' || String(s.endpoint).length > 1000) return { error: 'Invalid subscription' };
  const p256dh = s.keys?.p256dh, auth = s.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY.test(p256dh) || !KEY.test(auth)) {
    return { error: 'Invalid subscription' };
  }
  const exp = typeof s.expirationTime === 'number' ? s.expirationTime : null;
  return { topicId: b.topicId, notificationType: type, subscription: { endpoint: url.toString(), expirationTime: exp, keys: { p256dh, auth } } };
}
