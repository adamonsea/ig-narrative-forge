import { useEditorialProfile } from "@/components/settings/EventCaptionsSettings";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { londonToday, onePerTitle, upcomingWhatsOn, type WhatsOnFeedEvent } from "@/lib/whatsOn";

const feedKey = (topicId: string | undefined) => ["whats-on", topicId] as const;
const deskKey = (topicId: string | undefined) => ["event-desk", topicId] as const;

// Reader-side hooks live in useFeedEvents (kept out of the Desk/settings imports below).
export { useWhatsOnEvents, useEventsFeed } from "@/hooks/useFeedEvents";

export interface DeskEvent {
  id: string;
  title: string;
  start_date: string;
  start_time: string | null;
  location: string | null;
  source_name: string | null;
  source_url: string | null;
  status: "pending" | "excluded" | "deleted" | "published";
  source_api?: string | null | undefined;
  exclusion_reason: string | null;
  /** The owner confirmed it's fine where it is: never flagged as out of area again. */
  area_confirmed?: boolean | undefined;
  relevance_score: number | null;
  created_at: string;
  event_type?: string | null | undefined;
}

export interface EventDesk {
  eventsOn: boolean;
  showInFeed: boolean;
  /** Readers may suggest events (they land in Waiting). */
  readerSuggestions: boolean;
  sourceCount: number;
  waiting: DeskEvent[];
  hidden: DeskEvent[];
  /** Exactly what readers see in the card set (up to 8). */
  live: WhatsOnFeedEvent[];
  /** Published upcoming events beyond the 8 shown. */
  liveMore: number;
  /** Every published upcoming event (next 31 days, one per name), for the horizon bar. */
  allLive: WhatsOnFeedEvent[];
  /** Every published upcoming event however far ahead (one per name), for Coming up. */
  upcoming: DeskEvent[];
}

/** Everything the Desk needs about events: Waiting, Hidden, Live and the two switches. */
export function useEventDesk(topicId: string | undefined) {
  return useQuery({
    queryKey: deskKey(topicId),
    enabled: Boolean(topicId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<EventDesk> => {
      const today = londonToday();
      const fields = "id, title, start_date, start_time, location, source_name, source_url, source_api, status, exclusion_reason, area_confirmed, relevance_score, created_at, event_type";
      const [topicRes, insightRes, sourcesRes, queueRes, liveRes, publishedRes] = await Promise.all([
        supabase.from("topics").select("events_enabled").eq("id", topicId!).maybeSingle(),
        supabase.from("topic_insight_settings").select("events_cards_enabled, reader_event_submissions").eq("topic_id", topicId!).maybeSingle(),
        supabase.from("event_sources").select("id", { count: "exact", head: true }).eq("topic_id", topicId!),
        supabase.from("events")
          .select("id, title, start_date, start_time, location, source_name, source_url, source_api, status, exclusion_reason, relevance_score, created_at, event_type")
          .eq("topic_id", topicId!).in("status", ["pending", "excluded", "deleted"]).gte("start_date", today)
          .order("start_date").limit(1000),
        (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topicId }),
        supabase.from("events").select(fields)
          .eq("topic_id", topicId!).eq("status", "published").gte("start_date", today)
          .order("start_date").limit(2000),
      ]);
      if (queueRes.error) throw queueRes.error;
      const rows = (queueRes.data ?? []) as unknown as DeskEvent[];
      const published = (publishedRes.data ?? []) as unknown as DeskEvent[];
      const publishedTitles = new Set([...((liveRes.data ?? []) as WhatsOnFeedEvent[]), ...published].map((e) => e.title.toLowerCase().replace(/\s+/g, " ").trim()));
      const notLive = (e: DeskEvent) => !publishedTitles.has(e.title.toLowerCase().replace(/\s+/g, " ").trim());
      const allLive = (liveRes.data ?? []) as WhatsOnFeedEvent[];
      const live = upcomingWhatsOn(allLive, today);
      return {
        eventsOn: Boolean((topicRes.data as any)?.events_enabled),
        showInFeed: Boolean((insightRes.data as any)?.events_cards_enabled),
        readerSuggestions: Boolean((insightRes.data as any)?.reader_event_submissions),
        sourceCount: sourcesRes.count ?? 0,
        waiting: onePerTitle(rows.filter((e) => e.status === "pending").filter(notLive)),
        hidden: onePerTitle(rows.filter((e) => e.status !== "pending").filter(notLive)),
        live,
        liveMore: Math.max(0, allLive.length - live.length),
        allLive,
        upcoming: onePerTitle(published),
      };
    },
  });
}

type EventAction = "publish" | "skip" | "unhide";

const DONE: Record<EventAction, string> = { publish: "Published", skip: "Skipped", unhide: "Back in Waiting" };
const UNDO: Record<EventAction, EventAction> = { publish: "unhide", skip: "unhide", unhide: "skip" };

/** Owner actions on events and the two event switches, with Undo. */
export function useEventDeskActions(topicId: string | undefined) {
  const queryClient = useQueryClient();
  useEditorialProfile(topicId); // keeps the captions switch cached for Publish
  const { toast } = useToast();

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: deskKey(topicId) });
    queryClient.invalidateQueries({ queryKey: feedKey(topicId) });
  }, [queryClient, topicId]);

  const run = useCallback(async (eventId: string, action: EventAction) => {
    const { error } = await (supabase.rpc as any)("set_topic_event_visibility", { p_event_id: eventId, p_action: action });
    if (error) throw error;
  }, []);

  const act = useCallback(async (event: Pick<DeskEvent, "id" | "title">, action: EventAction, undo: EventAction = UNDO[action]) => {
    const before = queryClient.getQueryData<EventDesk>(deskKey(topicId));
    if (before) {
      queryClient.setQueryData<EventDesk>(deskKey(topicId), {
        ...before,
        waiting: before.waiting.filter((e) => e.id !== event.id),
        hidden: before.hidden.filter((e) => e.id !== event.id),
        live: action === "skip" ? before.live.filter((e) => e.id !== event.id) : before.live,
        allLive: action === "skip" ? before.allLive.filter((e) => e.id !== event.id) : before.allLive,
        upcoming: action === "skip" ? before.upcoming.filter((e) => e.id !== event.id) : before.upcoming,
      });
    }
    try {
      await run(event.id, action);
      // Feeds with captions on: write this event's copy on approval (the server skips unchanged facts)
      if (action === "publish" && queryClient.getQueryData<{ enabled?: boolean } | null>(["editorial-profile", topicId])?.enabled) {
        void supabase.functions.invoke("scrape-whats-on", { body: { action: "editorial_copy", eventId: event.id } })
          .then(() => queryClient.invalidateQueries({ queryKey: ["event-editorial", event.id] }));
      }
      toast({
        title: DONE[action],
        description: event.title,
        action: (
          <ToastAction altText="Undo" onClick={async () => { try { await run(event.id, undo); } finally { refresh(); } }}>
            Undo
          </ToastAction>
        ),
      });
    } catch {
      if (before) queryClient.setQueryData(deskKey(topicId), before);
      toast({ title: "Couldn't do that", description: "Please try again.", variant: "destructive" });
    } finally {
      refresh();
    }
  }, [queryClient, refresh, run, toast, topicId]);

  const setEventsOn = useCallback(async (on: boolean) => {
    const { error } = await supabase.from("topics").update({ events_enabled: on, updated_at: new Date().toISOString() } as any).eq("id", topicId!);
    if (error) toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    refresh();
  }, [refresh, toast, topicId]);

  const saveInsight = useCallback(async (field: "events_cards_enabled" | "reader_event_submissions", on: boolean) => {
    const { data, error } = await supabase.from("topic_insight_settings").update({ [field]: on } as any).eq("topic_id", topicId!).select("topic_id");
    let failed = Boolean(error);
    if (!error && (!data || data.length === 0)) {
      const { error: insertError } = await supabase.from("topic_insight_settings").insert({ topic_id: topicId, [field]: on } as any);
      failed = Boolean(insertError);
    }
    if (failed) toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["topic-insight-settings", topicId] });
    refresh();
  }, [queryClient, refresh, toast, topicId]);
  const setShowInFeed = useCallback((on: boolean) => saveInsight("events_cards_enabled", on), [saveInsight]);
  const setReaderSuggestions = useCallback((on: boolean) => saveInsight("reader_event_submissions", on), [saveInsight]);

  /** Take several Live events off the feed at once (e.g. all flagged out of area); one toast, Undo puts them back. */
  const removeManyFromLive = useCallback(async (events: Pick<DeskEvent, "id" | "title">[]) => {
    if (events.length === 0) return;
    // Removal sticks by event name across the feed, so one call per name is enough.
    const seen = new Set<string>();
    const unique = events.filter((e) => { const k = e.title.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const done: Pick<DeskEvent, "id" | "title">[] = [];
    try {
      for (const e of unique) { await run(e.id, "skip"); done.push(e); }
      toast({
        title: `Removed ${events.length} ${events.length === 1 ? "event" : "events"}`,
        description: "They're in Didn't make the cut.",
        action: (
          <ToastAction altText="Undo" onClick={async () => { try { for (const e of done) await run(e.id, "publish"); } finally { refresh(); } }}>
            Undo
          </ToastAction>
        ),
      });
    } catch {
      toast({ title: "Couldn't remove them all", description: done.length ? `${done.length} removed. Please try again for the rest.` : "Please try again.", variant: "destructive" });
    } finally {
      refresh();
    }
  }, [refresh, run, toast]);

  /** Live events flagged out of area that the owner says are fine: the flag goes and never comes back. Undo restores it. */
  const keepInArea = useCallback(async (events: Pick<DeskEvent, "id" | "title">[]) => {
    if (events.length === 0) return;
    const seen = new Set<string>();
    const unique = events.filter((e) => { const k = e.title.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const keys = new Set(unique.map((e) => e.title.trim().toLowerCase()));
    const mark = (on: boolean) => {
      const cur = queryClient.getQueryData<EventDesk>(deskKey(topicId));
      if (!cur) return;
      queryClient.setQueryData<EventDesk>(deskKey(topicId), {
        ...cur,
        upcoming: cur.upcoming.map((e) => (keys.has(e.title.trim().toLowerCase()) ? { ...e, area_confirmed: on } : e)),
      });
    };
    const setArea = (e: Pick<DeskEvent, "id">, on: boolean) =>
      (supabase.rpc as any)("set_topic_event_visibility", { p_event_id: e.id, p_action: on ? "confirm_area" : "unconfirm_area" })
        .then(({ error }: { error: unknown }) => { if (error) throw error; });
    mark(true);
    const done: Pick<DeskEvent, "id" | "title">[] = [];
    try {
      for (const e of unique) { await setArea(e, true); done.push(e); }
      toast({
        title: events.length === 1 ? "Kept" : `Kept ${events.length} events`,
        description: events.length === 1 ? events[0]!.title : undefined,
        action: (
          <ToastAction altText="Undo" onClick={async () => { mark(false); try { for (const e of done) await setArea(e, false); } finally { refresh(); } }}>
            Undo
          </ToastAction>
        ),
      });
    } catch {
      toast({ title: "Couldn't do that", description: "Please try again.", variant: "destructive" });
    } finally {
      refresh();
    }
  }, [queryClient, refresh, toast, topicId]);

  return {
    publish: (e: Pick<DeskEvent, "id" | "title">) => act(e, "publish"),
    keepInArea,
    removeManyFromLive,
    skip: (e: Pick<DeskEvent, "id" | "title">) => act(e, "skip"),
    /** Take a Live event off the feed (to Hidden); Undo puts it straight back. */
    removeFromLive: (e: Pick<DeskEvent, "id" | "title">) => act(e, "skip", "publish"),
    unhide: (e: Pick<DeskEvent, "id" | "title">) => act(e, "unhide"),
    setEventsOn,
    setShowInFeed,
    setReaderSuggestions,
    refresh,
  };
}
