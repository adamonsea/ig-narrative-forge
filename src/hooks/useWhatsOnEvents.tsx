import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { londonToday, onePerTitle, upcomingWhatsOn, type WhatsOnFeedEvent } from "@/lib/whatsOn";

const feedKey = (topicId: string | undefined) => ["whats-on", topicId] as const;
const deskKey = (topicId: string | undefined) => ["event-desk", topicId] as const;

/** The feed's upcoming published events (next 14 days, soonest first), fetched once per feed. */
export function useWhatsOnEvents(topicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKey(topicId),
    enabled: Boolean(topicId) && enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? []) as WhatsOnFeedEvent[];
    },
  });
}

export interface DeskEvent {
  id: string;
  title: string;
  start_date: string;
  start_time: string | null;
  location: string | null;
  source_name: string | null;
  source_url: string | null;
  status: "pending" | "excluded" | "deleted" | "published";
  source_api?: string | null;
  exclusion_reason: string | null;
  relevance_score: number | null;
  created_at: string;
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
}

/** Everything the Desk needs about events: Waiting, Hidden, Live and the two switches. */
export function useEventDesk(topicId: string | undefined) {
  return useQuery({
    queryKey: deskKey(topicId),
    enabled: Boolean(topicId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<EventDesk> => {
      const today = londonToday();
      const [topicRes, insightRes, sourcesRes, queueRes, liveRes] = await Promise.all([
        supabase.from("topics").select("events_enabled").eq("id", topicId!).maybeSingle(),
        supabase.from("topic_insight_settings").select("events_cards_enabled, reader_event_submissions").eq("topic_id", topicId!).maybeSingle(),
        supabase.from("event_sources").select("id", { count: "exact", head: true }).eq("topic_id", topicId!),
        supabase.from("events")
          .select("id, title, start_date, start_time, location, source_name, source_url, source_api, status, exclusion_reason, relevance_score, created_at")
          .eq("topic_id", topicId!).in("status", ["pending", "excluded", "deleted"]).gte("start_date", today)
          .order("start_date").limit(1000),
        (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topicId }),
      ]);
      if (queueRes.error) throw queueRes.error;
      const rows = (queueRes.data ?? []) as unknown as DeskEvent[];
      const publishedTitles = new Set(((liveRes.data ?? []) as WhatsOnFeedEvent[]).map((e) => e.title.toLowerCase().replace(/\s+/g, " ").trim()));
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
      });
    }
    try {
      await run(event.id, action);
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

  return {
    publish: (e: Pick<DeskEvent, "id" | "title">) => act(e, "publish"),
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
