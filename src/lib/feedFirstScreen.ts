/**
 * First screen of a public feed, fetched by the route loader (on the server for a
 * fresh visit) so the feed hook can show card 1 without waiting for its own calls.
 * Public data only, publishable key, same RPCs and order as the feed hook.
 */
import { optimizeImageUrl } from "@/lib/imageOptimization";

const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI";

export interface FeedFirstScreen {
  topicId: string;
  rows: any[];
  popularity: any[];
  meta: any[];
  /** Card-size URL of the first cover, for a preload tag. */
  firstCover: string | null;
}

async function call<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Card width on a typical phone (2x screen) — must match StoryCarousel's request so the preload is reused. */
export const PHONE_COVER_PX = 800;

export async function feedFirstScreen(slug: string, limit = 20): Promise<FeedFirstScreen | null> {
  const t = await call<{ id: string }[]>(
    `topics?slug=ilike.${encodeURIComponent(slug)}&is_public=eq.true&select=id&limit=1`,
  );
  const topicId = t?.[0]?.id;
  if (!topicId) return null;
  const [rows, popularity] = await Promise.all([
    call<any[]>("rpc/get_topic_stories_with_keywords", {
      p_topic_id: topicId, p_keyword_filters: null, p_source_filters: null, p_limit: limit, p_offset: 0,
    }),
    call<any[]>("rpc/get_popular_stories_by_period", { p_topic_id: topicId }),
  ]);
  if (!rows?.length) return null;
  const ids = [...new Set(rows.map((r) => r.story_id))];
  const meta =
    (await call<any[]>(
      `stories?id=in.(${ids.join(",")})&select=id,slug,is_parliamentary,mp_name,mp_party,constituency,tone,cover_illustration_url,animated_illustration_url`,
    )) ?? [];
  const cover = rows[0]?.story_cover_illustration_url as string | null;
  const px = PHONE_COVER_PX;
  return {
    topicId, rows, popularity: popularity ?? [], meta,
    firstCover: cover ? optimizeImageUrl(cover, { width: px, height: Math.round(px * 0.75), quality: 75 }) : null,
  };
}
