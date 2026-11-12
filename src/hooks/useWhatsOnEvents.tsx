import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { WhatsOnFeedEvent } from "@/lib/whatsOn";

const key = (topicId: string | undefined) => ["whats-on", topicId] as const;

/** The feed's upcoming events (next 14 days, soonest first), fetched once and shared by every card set. */
export function useWhatsOnEvents(topicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: key(topicId),
    enabled: Boolean(topicId) && enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? []) as WhatsOnFeedEvent[];
    },
  });
}

/** Owner action: take an event off the feed (with Undo), or bring one back. */
export function useEventVisibility(topicId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const setVisibility = useCallback(async (eventId: string, action: "remove" | "restore") => {
    const { error } = await (supabase.rpc as any)("set_topic_event_visibility", { p_event_id: eventId, p_action: action });
    if (error) throw error;
  }, []);

  const remove = useCallback(async (event: WhatsOnFeedEvent) => {
    const before = queryClient.getQueryData<WhatsOnFeedEvent[]>(key(topicId));
    queryClient.setQueryData<WhatsOnFeedEvent[]>(key(topicId), (list) => (list ?? []).filter((e) => e.id !== event.id));
    try {
      await setVisibility(event.id, "remove");
      toast({
        title: "Removed from your feed",
        description: event.title,
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              try {
                await setVisibility(event.id, "restore");
              } finally {
                queryClient.invalidateQueries({ queryKey: key(topicId) });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch {
      queryClient.setQueryData(key(topicId), before);
      toast({ title: "Couldn't remove that event", description: "Please try again.", variant: "destructive" });
    }
  }, [queryClient, setVisibility, toast, topicId]);

  const restore = useCallback(async (eventId: string) => {
    await setVisibility(eventId, "restore");
    queryClient.invalidateQueries({ queryKey: key(topicId) });
  }, [queryClient, setVisibility, topicId]);

  return { remove, restore };
}
