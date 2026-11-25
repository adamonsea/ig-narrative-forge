import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Row = { topic_id: string; name: string; status: string; reason: string | null; changed_at: string; checked_at: string };
const DOT: Record<string, string> = { red: "bg-destructive", amber: "bg-attention", green: "bg-pop" };

export function FeedHealthPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-feed-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_feed_health" as never);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });
  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (!data?.length) return <p className="text-base text-muted-foreground">No live feeds checked yet.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {data.map((r) => (
        <li key={r.topic_id} className="flex items-center gap-3 px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[r.status] ?? "bg-muted-foreground"}`} aria-label={r.status} />
          <span className="text-base font-medium">{r.name}</span>
          <span className="text-base text-muted-foreground">{r.reason ?? "Healthy"}</span>
          <span className="ml-auto text-sm text-muted-foreground">since {new Date(r.changed_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
        </li>
      ))}
    </ul>
  );
}
