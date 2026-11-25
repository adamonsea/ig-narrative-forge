/**
 * Feed API v1 — events. Pure shaping of the guarded `feed_api_events` result into the public JSON contract.
 * No UI, no tenant values: liftable as-is. Stories and pins will be added as sibling modules with the same envelope.
 */
export const FEED_API_SITE = "https://curatr.pro";
export const STORAGE_BASE = "https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/topic-assets/";

export type FeedApiErrorCode = "invalid_token" | "wrong_feed" | "feed_not_found" | "rate_limited" | "bad_request" | "not_available" | "server_error";
export const ERROR_STATUS: Record<FeedApiErrorCode, number> = {
  invalid_token: 401, wrong_feed: 403, not_available: 403, feed_not_found: 404, rate_limited: 429, bad_request: 400, server_error: 500,
};
export const ERROR_MESSAGE: Record<FeedApiErrorCode, string> = {
  invalid_token: "Missing, unknown or revoked token.",
  wrong_feed: "This token belongs to a different feed.",
  not_available: "The Feed API isn't available for this feed.",
  feed_not_found: "No public feed with that handle.",
  rate_limited: "Too many requests. Limit is 60 per minute per token.",
  bad_request: "Invalid parameters.",
  server_error: "Something went wrong.",
};

export interface RawEvent {
  id: string; title: string; description: string | null; start_date: string; start_time: string | null;
  run_start: string | null; end_date: string | null; location: string | null; category: string | null;
  price: string | null; is_free: boolean | null; source_name: string | null; source_url: string | null;
  image_path: string | null; image_source_url: string | null;
}

export interface ApiEvent {
  id: string; title: string; description: string | null; start_date: string; start_time: string | null;
  run_start: string | null; run_end: string | null; venue: string | null; category: string | null;
  price: string | null; is_free: boolean; curatr_url: string; source: { name: string | null; url: string | null };
  image?: { url: string; credit: string | null; source_url: string | null };
}

export const encodeCursor = (offset: number) => btoa(`o:${offset}`).replace(/=+$/, "");
export function decodeCursor(cursor: string | null): number | null {
  if (!cursor) return 0;
  try { const m = /^o:(\d{1,6})$/.exec(atob(cursor)); return m ? Number(m[1]) : null; } catch { return null; }
}

export function shapeEvent(e: RawEvent, handle: string): ApiEvent {
  const out: ApiEvent = {
    id: e.id, title: e.title, description: e.description, start_date: e.start_date,
    start_time: e.start_time ? e.start_time.slice(0, 5) : null,
    run_start: e.end_date && e.end_date !== e.start_date ? (e.run_start ?? e.start_date) : null,
    run_end: e.end_date && e.end_date !== e.start_date ? e.end_date : null,
    venue: e.location, category: e.category, price: e.price, is_free: !!e.is_free,
    curatr_url: `${FEED_API_SITE}/@${handle}`,
    source: { name: e.source_name, url: e.source_url },
  };
  if (e.image_path) out.image = { url: STORAGE_BASE + e.image_path, credit: e.source_name, source_url: e.image_source_url };
  return out;
}

/** Paid add-on hook: return false here (e.g. by plan) to gate the API. Free during testing. */
export function feedApiAllowed(_topicHandle: string): boolean {
  return true;
}
