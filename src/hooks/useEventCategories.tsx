import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { STARTING_EVENT_CATEGORIES, eventsMatching, suggestEventCategory, type EventCategoryKey } from "@/lib/eventCategories";

const key = (topicId: string | undefined) => ["event-categories", topicId] as const;

/** The feed's event categories (starting ten + added), and the one suggestion to show, if any. */
export function useEventCategories(topicId: string | undefined) {
  return useQuery({
    queryKey: key(topicId),
    enabled: Boolean(topicId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [rows, others] = await Promise.all([
        (supabase.from as any)("topic_event_categories").select("category, state").eq("topic_id", topicId!),
        supabase.from("events").select("id, title, description").eq("topic_id", topicId!).eq("event_type", "other")
          .in("status", ["published", "pending"]).gte("created_at", since).limit(1000),
      ]);
      const decided = ((rows.data ?? []) as { category: string; state: string }[]);
      const added = decided.filter((r) => r.state === "added").map((r) => r.category);
      const categories = [...STARTING_EVENT_CATEGORIES, ...added.filter((c) => !(STARTING_EVENT_CATEGORIES as readonly string[]).includes(c)), "other"];
      const otherEvents = (others.data ?? []) as { id: string; title: string; description: string | null }[];
      const suggestion = suggestEventCategory(otherEvents, decided.map((r) => r.category));
      const ids = suggestion ? eventsMatching(otherEvents, suggestion.category).map((e) => e.id) : [];
      return { categories, suggestion: suggestion ? { ...suggestion, ids } : null };
    },
  });
}

export function useEventCategoryActions(topicId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = useCallback((eventId?: string) => {
    queryClient.invalidateQueries({ queryKey: key(topicId) });
    queryClient.invalidateQueries({ queryKey: ["event-desk", topicId] });
    queryClient.invalidateQueries({ queryKey: ["events-feed", topicId] });
    if (eventId) queryClient.invalidateQueries({ queryKey: ["event-detail", eventId] });
  }, [queryClient, topicId]);
  const fail = useCallback(() => toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" }), [toast]);

  const setCategory = useCallback(async (eventId: string, category: string) => {
    const { error } = await (supabase.rpc as any)("set_event_category", { p_event_id: eventId, p_category: category });
    if (error) fail();
    refresh(eventId);
  }, [fail, refresh]);

  const decide = useCallback(async (category: EventCategoryKey, state: "added" | "skipped", ids: string[] = []) => {
    const { error } = await (supabase.from as any)("topic_event_categories").upsert({ topic_id: topicId, category, state });
    if (error) { fail(); return; }
    if (state === "added" && ids.length) {
      const { error: e2 } = await (supabase.rpc as any)("retag_topic_events", { p_topic_id: topicId, p_category: category, p_event_ids: ids });
      if (e2) fail();
    }
    refresh();
  }, [fail, refresh, topicId]);

  return { setCategory, decide };
}
