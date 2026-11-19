import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showEventsInFeed, londonToday, type WhatsOnFeedEvent } from "@/lib/whatsOn";
import { briefingWindow, pickBriefingEvents, briefingEventsLabel, type BriefingKind } from "@/lib/briefingEvents";

export interface BriefingTopic {
  id: string;
  events_enabled?: boolean | null | undefined;
}

/** Whether this feed shows events to readers (same two switches as the feed). */
export async function fetchFeedEventSettings(topic: BriefingTopic) {
  const { data } = await supabase
    .from("topic_insight_settings")
    .select("events_cards_enabled, reader_event_submissions")
    .eq("topic_id", topic.id)
    .maybeSingle();
  return {
    eventsInFeed: showEventsInFeed(topic.events_enabled, (data as any)?.events_cards_enabled),
    readerSuggestions: Boolean((data as any)?.reader_event_submissions),
  };
}

/**
 * What's coming up for a briefing: today & tomorrow (daily) or the week ahead (weekly),
 * only while the briefing is current and only when the feed shows events.
 * `periodEnd` is the last day (YYYY-MM-DD) the briefing's news covers.
 */
export function useBriefingEvents(topic: BriefingTopic | null, kind: BriefingKind, periodEnd: string | null) {
  const today = londonToday();
  const window = periodEnd ? briefingWindow(kind, periodEnd, today) : null;
  const q = useQuery({
    queryKey: ["briefing-events", topic?.id, kind, window?.from, window?.to],
    enabled: Boolean(topic?.id) && Boolean(window),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const settings = await fetchFeedEventSettings(topic!);
      if (!settings.eventsInFeed) return { events: [] as WhatsOnFeedEvent[], readerSuggestions: false };
      const { data, error } = await (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topic!.id });
      if (error) throw error;
      return { events: pickBriefingEvents((data ?? []) as WhatsOnFeedEvent[], window), readerSuggestions: settings.readerSuggestions };
    },
  });
  const events = q.data?.events ?? [];
  return {
    events,
    label: briefingEventsLabel(kind, events, today),
    today,
    readerSuggestions: q.data?.readerSuggestions ?? false,
    // Settled when there's nothing to fetch (no topic yet, or the briefing is too old)
    loading: Boolean(topic?.id) && Boolean(window) && q.isLoading,
  };
}
