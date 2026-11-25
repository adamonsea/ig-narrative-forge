import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** One quiet line on the Desk, only when the owner's own feed needs a fix they can make. */
export function DeskHealthNotice({ topicId }: { topicId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["feed-health", topicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_feed_health" as never, { p_topic_id: topicId } as never);
      if (error) return null;
      return ((data as unknown as { status: string; owner_action: string | null }[]) ?? [])[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });
  if (!data?.owner_action || data.status === "green") return null;
  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-xl bg-attention-soft px-4 py-3">
      <span className="text-base">{data.owner_action}</span>
      <Button variant="outline" size="sm" onClick={() => navigate(`${window.location.pathname}?tab=sources`)}>Fix</Button>
    </div>
  );
}
