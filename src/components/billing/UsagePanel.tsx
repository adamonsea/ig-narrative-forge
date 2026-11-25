import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usagePercent } from "@/lib/usageBars";

interface MyUsage {
  is_pro: boolean;
  stories_used: number; stories_limit: number;
  credits_used: number; credits_limit: number;
  reset_at: string;
  feeds: { topic_id: string; name: string; stories: number; credits: number }[];
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-GB");

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-lg font-semibold">{label}</span>
        <span className="text-base text-muted-foreground">{fmt(used)} of {fmt(limit)}</span>
      </div>
      <Progress value={usagePercent({ used, limit })} aria-label={`${label}: ${fmt(used)} of ${fmt(limit)}`} />
    </div>
  );
}

/** Settings → Usage: stories and credits this period, reset date, per-feed split. */
export function UsagePanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_usage" as never);
      if (error) throw error;
      return data as unknown as MyUsage;
    },
  });

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
  if (error || !data) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg bg-destructive/10 p-4">
        <span>Couldn't load usage.</span>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const reset = new Date(data.reset_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const feeds = data.feeds.filter((f) => f.stories > 0 || f.credits > 0);

  return (
    <div className="space-y-8">
      <Bar label="Stories" used={data.stories_used} limit={data.stories_limit} />
      <Bar label="Credits" used={data.credits_used} limit={data.credits_limit} />
      <p className="text-base text-muted-foreground">{data.is_pro ? "Resets" : "Trial ends"} {reset}</p>
      {feeds.length > 1 && (
        <ul className="divide-y rounded-xl border">
          {feeds.map((f) => (
            <li key={f.topic_id} className="flex items-baseline justify-between gap-4 p-4">
              <span className="text-base">{f.name}</span>
              <span className="text-sm text-muted-foreground">{fmt(f.stories)} stories · {fmt(f.credits)} credits</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
