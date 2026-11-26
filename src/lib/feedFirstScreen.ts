/**
 * First screen of a public feed, fetched by the route loader (on the server for a
 * fresh visit) so the feed hook can show card 1 without waiting for its own calls.
 * Public data only, publishable key, same RPCs and order as the feed hook.
 */
import { optimizeImageUrl } from "@/lib/imageOptimization";
import { showEventsInFeed, EVENTS_PER_PAGE } from "@/lib/whatsOn";
import { eventCardMode } from "@/lib/feedCardPositions";
import { isStoredEventPhoto } from "@/lib/eventPhotoPath";

const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI";

export interface FeedFirstScreen {
  topicId: string;
  rows: any[];
  popularity: any[];
  meta: any[];
  /** The two topic rows the feed hook's loadTopic reads, so it can skip them on first load. */
  publicTopic: any | null;
  fullTopic: any | null;
  /** Mapped like useTopicMetadata's insight query; null if the call failed. */
  insight: InsightSettings | null;
  /** First page of individual event cards (events-led / individual feeds), else null. */
  events: any[] | null;
  /** Card-size URL of the first cover, for a preload tag. */
  firstCover: string | null;
  /** Phone-only media query for the preload, or null for every screen. */
  firstCoverMedia: string | null;
}

export interface InsightSettings {
  playModeEnabled: boolean;
  quizCardsEnabled: boolean;
  siftEnabled: boolean;
  thisTimeLastMonthEnabled: boolean;
  parliamentaryCardsEnabled?: boolean;
  eventsCardsEnabled?: boolean;
  readerEventSubmissions?: boolean;
}

export const DEFAULT_INSIGHT: InsightSettings = { playModeEnabled: true, quizCardsEnabled: false, siftEnabled: false, thisTimeLastMonthEnabled: false };

/** One mapping for the insight-settings row, used by the loader and useTopicMetadata. */
export function mapInsightSettings(data: any | null): InsightSettings {
  if (!data) return DEFAULT_INSIGHT;
  return {
    playModeEnabled: data.play_mode_enabled !== false,
    quizCardsEnabled: data.quiz_cards_enabled ?? false,
    siftEnabled: data.sift_enabled ?? false,
    thisTimeLastMonthEnabled: data.this_time_last_month_enabled ?? false,
    parliamentaryCardsEnabled: data.parliamentary_cards_enabled ?? false,
    eventsCardsEnabled: data.events_cards_enabled ?? false,
    readerEventSubmissions: data.reader_event_submissions ?? false,
  };
}

export const INSIGHT_SELECT = "play_mode_enabled,quiz_cards_enabled,sift_enabled,this_time_last_month_enabled,parliamentary_cards_enabled,events_cards_enabled,reader_event_submissions";
export const PUBLIC_TOPIC_SELECT = "id,name,description,topic_type,region,slug,is_public,is_active,created_at";
export const FULL_TOPIC_SELECT = "keywords,landmarks,organizations,branding_config,donation_enabled,donation_config,automated_insights_enabled,illustration_primary_color,events_enabled,feed_lead,event_cards,event_currency,story_cover_style,ai_summary_tag";

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
  const enc = encodeURIComponent(slug);
  const [pub, full] = await Promise.all([
    call<any[]>(`safe_public_topics?slug=ilike.${enc}&select=${PUBLIC_TOPIC_SELECT}`),
    call<any[]>(`topics?slug=ilike.${enc}&is_public=eq.true&select=id,${FULL_TOPIC_SELECT}&limit=1`),
  ]);
  const publicTopic = pub?.find((t) => t.slug?.toLowerCase() === slug.toLowerCase()) ?? null;
  const topicId: string | undefined = publicTopic?.id ?? full?.[0]?.id;
  if (!topicId) return null;
  const fullRow = full?.[0] ?? null;
  const fullTopic = fullRow ? (({ id: _id, ...rest }) => rest)(fullRow) : null;
  const [rows, popularity, insightRows] = await Promise.all([
    call<any[]>("rpc/get_topic_stories_with_keywords", {
      p_topic_id: topicId, p_keyword_filters: null, p_source_filters: null, p_limit: limit, p_offset: 0,
    }),
    call<any[]>("rpc/get_popular_stories_by_period", { p_topic_id: topicId }),
    call<any[]>(`topic_insight_settings?topic_id=eq.${topicId}&select=${INSIGHT_SELECT}`),
  ]);
  const insight = insightRows ? mapInsightSettings(insightRows[0] ?? null) : null;
  // Same rule as TopicFeed: individual event cards when events show in the feed and the mode is individual.
  const individual = !!fullRow && !!insight && showEventsInFeed(fullRow.events_enabled, insight.eventsCardsEnabled)
    && eventCardMode(fullRow.feed_lead, fullRow.event_cards) === "individual";
  const eventsLed = individual && fullRow?.feed_lead === "events";
  const [meta, events] = await Promise.all([
    rows?.length
      ? call<any[]>(`stories?id=in.(${[...new Set(rows.map((r) => r.story_id))].join(",")})&select=id,slug,is_parliamentary,mp_name,mp_party,constituency,tone,cover_illustration_url,animated_illustration_url`)
      : Promise.resolve([] as any[]),
    individual
      ? call<any[]>("rpc/get_topic_events_feed", { p_topic_id: topicId, p_limit: EVENTS_PER_PAGE, p_offset: 0 })
      : Promise.resolve(null),
  ]);
  if (!rows?.length && !events?.length) return null;
  let firstCover: string | null = null;
  let firstCoverMedia: string | null = null;
  const photo = eventsLed ? events?.[0]?.image_path : null;
  if (eventsLed) {
    // Events-led: card 1 is an event; preload its stored photo (same unsized address EventCard uses).
    firstCover = isStoredEventPhoto(photo) ? `${SUPABASE_URL}/storage/v1/object/public/topic-assets/${photo}` : null;
  } else {
    const cover = rows?.[0]?.story_cover_illustration_url as string | null;
    const px = PHONE_COVER_PX;
    firstCover = cover ? optimizeImageUrl(cover, { width: px, height: Math.round(px * 0.75), quality: 75 }) : null;
    firstCoverMedia = "(max-width: 400px) and (min-resolution: 2dppx)";
  }
  return { topicId, rows: rows ?? [], popularity: popularity ?? [], meta: meta ?? [], publicTopic, fullTopic, insight, events: events ?? null, firstCover, firstCoverMedia };
}
