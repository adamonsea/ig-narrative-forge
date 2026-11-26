import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/connected-apps")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connected apps | Curatr" },
      { name: "description", content: "See and disconnect apps that can use your Curatr account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ href: `/auth?mode=signin&redirect=${encodeURIComponent(location.pathname)}` });
  },
  component: ConnectedApps,
});

type Grant = { client: { id: string; name: string }; granted_at: string };

function ConnectedApps() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const { data, error: err } = await supabase.auth.oauth.listGrants();
    if (err) { setGrants([]); setError("Couldn't load connected apps."); return; }
    setGrants((data ?? []) as Grant[]);
  }
  useEffect(() => { void load(); }, []);

  async function disconnect(clientId: string) {
    const { error: err } = await supabase.auth.oauth.revokeGrant({ clientId });
    if (err) { setError("Couldn't disconnect. Try again."); return; }
    await supabase.from("mcp_studio_grants" as never).delete().eq("client_id", clientId);
    setGrants((g) => (g ?? []).filter((x) => x.client.id !== clientId));
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold text-foreground">Connected apps</h1>
        {error && (
          <p role="alert" className="mt-4 flex items-center justify-between rounded-lg bg-destructive/10 p-3 text-base text-destructive">
            {error}
            <Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button>
          </p>
        )}
        <div className="mt-6 space-y-3">
          {grants === null && <Skeleton className="h-16 w-full rounded-xl" />}
          {grants?.length === 0 && !error && <p className="text-base text-muted-foreground">No apps connected.</p>}
          {grants?.map((g) => (
            <div key={g.client.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-base font-medium text-foreground">{g.client.name || "Unnamed app"}</p>
                <p className="text-sm text-muted-foreground">Since {new Date(g.granted_at).toLocaleDateString("en-GB")}</p>
              </div>
              <Button variant="outline" onClick={() => void disconnect(g.client.id)}>Disconnect</Button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
