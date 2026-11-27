import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CuratrLogo } from "@/components/brand/CuratrLogo";
import { STUDIO_GRANT_VERSION } from "@/lib/mcp/allowance";

type Details = { client?: { id: string; name: string } | null; user?: { email: string } | null; redirect_url?: string };

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // The session lives in the browser; server rendering would bounce signed-in owners.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect an app to Curatr" },
      { name: "description", content: "Allow an app to see and manage your Curatr feeds." },
      { property: "og:title", content: "Connect an app to Curatr" },
      { property: "og:description", content: "Allow an app to see and manage your Curatr feeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This link is missing its request. Start again from the app.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ href: `/auth?mode=signin&redirect=${encodeURIComponent(location.pathname + location.searchStr)}` });
    }
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw error;
    const d = data as Details;
    if (d.redirect_url && !d.client) throw redirect({ href: d.redirect_url });
    return d;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <Shell>
      <p role="alert" className="text-base text-foreground">
        Couldn't load this request. {error instanceof Error ? error.message : ""}
      </p>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <CuratrLogo iconOnly className="mb-6 text-[32px]" />
        {children}
      </div>
    </main>
  );
}

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name || "This app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    if (approve && details?.client?.id) {
      const { error: recErr } = await supabase.rpc("mcp_studio_record_grant" as never, {
        p_client_id: details.client.id, p_client_name: name, p_version: STUDIO_GRANT_VERSION,
      } as never);
      if (recErr) { setBusy(false); setError("Couldn't save this connection. Try again."); return; }
    }
    const { data, error: err } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true });
    if (err || !data?.redirect_url) { setBusy(false); setError(err?.message ?? "Couldn't finish. Try again."); return; }
    window.location.href = data.redirect_url;
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold text-foreground">Allow {name} to see and manage your Curatr feeds</h1>
      {details?.user?.email && <p className="mt-3 text-sm text-muted-foreground">Signed in as {details.user.email}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-base text-destructive">{error}</p>}
      <div className="mt-8 flex gap-3">
        <Button disabled={busy} onClick={() => decide(true)} className="h-11 flex-1">Allow</Button>
        <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="h-11 flex-1">Cancel</Button>
      </div>
    </Shell>
  );
}
