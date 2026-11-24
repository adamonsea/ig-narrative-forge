import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PinnedEvent {
  id: string; title: string; start_date: string; start_time: string | null;
  location: string | null; source_url: string | null; event_type: string | null; image_path: string | null;
}

const key = (topicId?: string) => ["topic-pinned-events", topicId];

/** Up to 9 upcoming pinned events for a feed (public feeds and the owner's own). */
export function usePinnedEvents(topicId?: string) {
  return useQuery({
    queryKey: key(topicId),
    enabled: Boolean(topicId),
    staleTime: 60_000,
    queryFn: async (): Promise<PinnedEvent[]> => {
      const { data, error } = await (supabase.rpc as any)("get_topic_pinned_events", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? []) as PinnedEvent[];
    },
  });
}

/** Pin or unpin one event. Pins last until the event has passed. */
export function useSetEventPin(topicId?: string) {
  const qc = useQueryClient();
  return useCallback(async (eventId: string, pinned: boolean) => {
    const { error } = await (supabase.rpc as any)("set_event_pin", { p_event_id: eventId, p_pinned: pinned });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: key(topicId) });
  }, [qc, topicId]);
}
