import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Monitor, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { MockDesk } from "./MockDesk";
import { MockFeed, MOCK_FEED_NAME } from "./MockFeed";
import { useMockState } from "./useMockState";

/**
 * Hidden, owner-only clickable mocks: the What's on card in the feed and the one-pipeline Desk.
 * Dummy data only (kept in this browser); nothing here reads or writes real feeds.
 */
function FeedHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-lexend font-bold text-primary-foreground" aria-hidden="true">E</div>
        <span className="font-lexend text-lg font-semibold">{MOCK_FEED_NAME}</span>
      </div>
      <span className="rounded-full border border-border px-3 py-1 text-sm">Subscribe</span>
    </header>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${value === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function EventsDeskMock() {
  const { user, loading, userRole, isSuperAdmin, isProductOwner } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { state, update, reset } = useMockState();
  const embed = params.get("embed") === "feed";
  const view = (params.get("view") === "feed" ? "feed" : "desk") as "desk" | "feed";
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const allowed = isSuperAdmin || isProductOwner;
  const roleKnown = !loading && (!user || userRole !== null || isProductOwner);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
    else if (roleKnown && user && !allowed) navigate("/dashboard", { replace: true });
  }, [loading, user, roleKnown, allowed, navigate]);

  if (!roleKnown || !allowed) {
    return <main className="flex min-h-dvh items-center justify-center bg-background"><Spinner size="lg" /></main>;
  }

  const head = (
    <Helmet>
      <title>Events + Desk mock | Curatr</title>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );

  if (embed) {
    return (
      <main className="min-h-dvh bg-background">
        {head}
        <FeedHeader />
        <div className="px-3 py-4"><MockFeed state={state} notes={params.get("notes") === "1"} /></div>
      </main>
    );
  }

  const setView = (v: "desk" | "feed") => setParams((p) => { const n = new URLSearchParams(p); n.set("view", v); return n; }, { replace: true });

  return (
    <main className="min-h-dvh bg-background">
      {head}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Mock · dummy data</span>
            <Segmented label="Mock" value={view} onChange={(v) => setView(v as "desk" | "feed")} options={[{ value: "desk", label: "Desk" }, { value: "feed", label: "Feed" }]} />
          </div>
          <div className="flex items-center gap-2">
            {view === "feed" && (
              <Segmented label="Device" value={device} onChange={(v) => setDevice(v as "phone" | "desktop")} options={[
                { value: "phone", label: <><Smartphone className="h-4 w-4" aria-hidden="true" />Phone</> },
                { value: "desktop", label: <><Monitor className="h-4 w-4" aria-hidden="true" />Desktop</> },
              ]} />
            )}
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Reset</Button>
          </div>
        </div>
      </div>

      {view === "desk" ? (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <MockDesk state={state} update={update} onViewFeed={() => setView("feed")} />
        </div>
      ) : device === "phone" ? (
        <div className="flex justify-center px-4 py-10">
          <div className="overflow-hidden rounded-[2.75rem] border-[10px] border-foreground shadow-2xl">
            <iframe title="Feed on a phone" src="/dashboard/mock/events-desk?embed=feed&notes=1" className="block h-[780px] w-[390px] bg-background" />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="overflow-hidden rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-2.5" aria-hidden="true">
              <span className="h-3 w-3 rounded-full bg-muted-foreground/30" /><span className="h-3 w-3 rounded-full bg-muted-foreground/30" /><span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              <span className="ml-3 text-xs text-muted-foreground">curatr.pro/feed/eastbourne</span>
            </div>
            <div className="h-[820px] overflow-y-auto bg-background">
              <FeedHeader />
              <div className="px-4 py-6"><MockFeed state={state} notes /></div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
