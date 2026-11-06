import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PULSE_POLL_MS, type PulseFigures } from "@/lib/pulse";

export interface TopicPulse extends PulseFigures {
  reading_now: number;
  story_reads: Record<string, number>;
  rising_story_id: string | null;
  new_arrivals: number;
}

interface Ctx {
  pulse: TopicPulse | null;
  setStoryIds: (ids: string[]) => void;
  dismissMilestone: (key: string) => void;
  markDeskLooked: () => void;
}

const PulseContext = createContext<Ctx | null>(null);

export function TopicPulseProvider({ topicId, children }: { topicId: string; children: ReactNode }) {
  const [pulse, setPulse] = useState<TopicPulse | null>(null);
  const idsRef = useRef<string[]>([]);
  const [idsKey, setIdsKey] = useState("");

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const { data } = await supabase.rpc("get_topic_pulse" as any, { p_topic_id: topicId, p_story_ids: idsRef.current });
    if (data) setPulse(data as unknown as TopicPulse);
  }, [topicId]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, PULSE_POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, idsKey]);

  const setStoryIds = useCallback((ids: string[]) => {
    const key = ids.join(",");
    if (key === idsRef.current.join(",")) return;
    idsRef.current = ids;
    setIdsKey(key);
  }, []);

  const dismissMilestone = useCallback(
    (key: string) => {
      setPulse((p) => (p ? { ...p, dismissed: [...p.dismissed, key] } : p));
      supabase.rpc("dismiss_topic_milestone" as any, { p_topic_id: topicId, p_key: key });
    },
    [topicId],
  );

  const markDeskLooked = useCallback(() => {
    supabase.rpc("mark_desk_looked" as any, { p_topic_id: topicId });
  }, [topicId]);

  return (
    <PulseContext.Provider value={{ pulse, setStoryIds, dismissMilestone, markDeskLooked }}>
      {children}
    </PulseContext.Provider>
  );
}

export function useTopicPulse() {
  return useContext(PulseContext);
}
