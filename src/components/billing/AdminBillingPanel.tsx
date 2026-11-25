import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface Overview {
  daily: { day: string; pro_usd: number | null; free_usd: number | null; unknown_usd: number | null }[];
  over_limit: { user_id: string; email: string | null; usd: number }[];
  pause_free: boolean;
  enforce: boolean;
}
const usd = (n: number | null) => `$${Number(n || 0).toFixed(2)}`;

/** Admin: daily spend free vs Pro, accounts over $5 today, and the free-automation pause switch. */
export function AdminBillingPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-billing-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_billing_overview" as never, { p_days: 14 } as never);
      if (error) throw error;
      return data as unknown as Overview;
    },
  });
  const toggle = async (on: boolean) => {
    await supabase.rpc("set_pause_free_automation" as never, { p_on: on } as never);
    qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) return <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-4"><span>Couldn't load spend.</span><Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;

  return (
    <section aria-labelledby="billing-heading" className="space-y-6 rounded-xl border p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="billing-heading" className="text-2xl font-semibold">Spend</h2>
        <label className="flex items-center gap-3 text-base">
          Pause all free-account automation
          <Switch checked={data.pause_free} onCheckedChange={toggle} />
        </label>
      </div>
      {!data.enforce && <p className="text-sm text-muted-foreground">Shadow mode — nothing is charged or paused.</p>}
      {data.over_limit.length > 0 && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-4">
          {data.over_limit.map((a) => <p key={a.user_id}>{a.email ?? a.user_id} passed $5 today ({usd(a.usd)})</p>)}
        </div>
      )}
      <table className="w-full text-left text-base">
        <thead><tr className="border-b text-sm text-muted-foreground"><th className="py-2 font-normal">Day</th><th className="py-2 font-normal">Free</th><th className="py-2 font-normal">Pro</th><th className="py-2 font-normal">Unattributed</th></tr></thead>
        <tbody>
          {data.daily.map((d) => (
            <tr key={d.day} className="border-b last:border-0">
              <td className="py-2">{new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
              <td className="py-2">{usd(d.free_usd)}</td><td className="py-2">{usd(d.pro_usd)}</td><td className="py-2 text-muted-foreground">{usd(d.unknown_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
