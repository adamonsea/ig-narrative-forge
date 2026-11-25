import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pausedAction } from "@/lib/usageBars";

/**
 * One quiet amber line on the Desk: "Paused — out of credits" while billing pauses
 * this feed, otherwise the newest unseen 75/90/100% usage alert. Nothing otherwise.
 */
export function DeskBillingNotice({ topicId, usagePath }: { topicId: string; usagePath: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["feed-billing-state", topicId],
    queryFn: async () => {
      const [state, alerts] = await Promise.all([
        supabase.rpc("get_feed_billing_state" as never, { p_topic_id: topicId } as never),
        supabase.from("usage_alerts" as never).select("id, metric, threshold").is("seen_at", null)
          .eq("period", new Date().toISOString().slice(0, 7)).order("threshold", { ascending: false }).limit(1),
      ]);
      return {
        state: (state.error ? null : state.data) as { paused: boolean; is_pro: boolean } | null,
        alert: ((alerts.data as unknown as { id: string; metric: string; threshold: number }[] | null) ?? [])[0] ?? null,
      };
    },
    staleTime: 60_000,
  });

  if (data?.state?.paused) {
    return (
      <div role="status" className="flex items-center justify-between gap-4 rounded-xl bg-attention-soft px-4 py-3">
        <span className="text-base">Paused — out of credits</span>
        <Button variant="outline" size="sm" onClick={() => navigate("/pricing")}>{pausedAction(data.state.is_pro)}</Button>
      </div>
    );
  }
  const alert = data?.alert;
  if (!alert) return null;
  const open = async () => {
    await supabase.from("usage_alerts" as never).update({ seen_at: new Date().toISOString() } as never).eq("id", alert.id);
    qc.invalidateQueries({ queryKey: ["feed-billing-state", topicId] });
    navigate(usagePath);
  };
  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-xl bg-attention-soft px-4 py-3">
      <span className="text-base">{alert.threshold}% of {alert.metric} used</span>
      <Button variant="outline" size="sm" onClick={open}>See usage</Button>
    </div>
  );
}
