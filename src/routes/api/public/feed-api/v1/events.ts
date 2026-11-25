/**
 * Feed API v1 — GET /api/public/feed-api/v1/events?feed={handle}
 * Auth: Authorization: Bearer {feed token}. The token is checked, rate-limited (60/min) and matched to the feed
 * inside the guarded `feed_api_events` function; only reader-visible events come back.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ERROR_MESSAGE, ERROR_STATUS, decodeCursor, encodeCursor, feedApiAllowed, shapeEvent,
  type FeedApiErrorCode, type RawEvent,
} from "@/lib/feedApi/events";

const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Query = z.object({
  feed: z.string().min(1).max(60).regex(/^[A-Za-z0-9-]+$/),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
  cursor: z.string().max(40).optional(),
  from: date.optional(),
  to: date.optional(),
  category: z.string().max(60).optional(),
});

const fail = (code: FeedApiErrorCode, detail?: string) =>
  Response.json({ error: { code, message: detail ?? ERROR_MESSAGE[code] } }, { status: ERROR_STATUS[code], headers: { ...CORS, "Cache-Control": "no-store" } });

async function sha256Hex(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/feed-api/v1/events")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return fail("bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        const q = parsed.data;
        const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || !/^cfa_[0-9a-f]{48}$/.test(token)) return fail("invalid_token");
        const offset = q.cursor !== undefined ? decodeCursor(q.cursor) : (q.offset ?? 0);
        if (offset === null) return fail("bad_request", "cursor: invalid");
        if (!feedApiAllowed(q.feed)) return fail("not_available");

        let body: any;
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed_api_events`, {
            method: "POST",
            headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              p_token_hash: await sha256Hex(token), p_feed: q.feed, p_limit: q.limit, p_offset: offset,
              p_from: q.from ?? null, p_to: q.to ?? null, p_category: q.category ?? null,
            }),
          });
          if (!res.ok) return fail("server_error");
          body = await res.json();
        } catch {
          return fail("server_error");
        }
        if (body?.error) return fail(body.error as FeedApiErrorCode);

        const handle: string = body.feed.handle;
        const events = (body.events as RawEvent[]).map((e) => shapeEvent(e, handle));
        const nextOffset = offset + events.length;
        return Response.json(
          {
            api_version: "1",
            feed: { name: body.feed.name, handle, url: `https://curatr.pro/@${handle}` },
            events,
            total: body.total,
            next_cursor: nextOffset < body.total ? encodeCursor(nextOffset) : null,
          },
          { headers: { ...CORS, "Cache-Control": "private, max-age=60" } },
        );
      },
    },
  },
});
