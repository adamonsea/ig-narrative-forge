import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, ExternalLink, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { eventSourceKindLabel, hiddenSentence, londonToday, previewSentence } from "@/lib/whatsOn";
import { eventSourceHealth, type HealthVerdict } from "@/lib/sourceHealth";
import { SourceDots } from "@/components/sources/SourceDots";
import { SourceIcon } from "@/components/sources/SourceCard";
import { Figure, HealthLine, InfoTip, PanelSection } from "@/components/sources/SourcePanelParts";

interface EventSource {
  id: string;
  url: string;
  name: string;
  kind: string;
  auto_publish: boolean;
  is_active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  consecutive_empty_checks: number;
}

interface Preview {
  kind: string;
  found: number;
  excluded?: number;
  name: string;
  error: string | null;
  examples: { title: string; start_date: string }[];
}

export const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

export const withScheme = (raw: string) => {
  const t = raw.trim();
  return t && !/^(https?|webcal):\/\//i.test(t) ? `https://${t}` : t.replace(/^webcal:\/\//i, "https://");
};

async function callReader(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("scrape-whats-on", { body });
  if (error) {
    let details: any = null;
    if (error instanceof FunctionsHttpError) details = await error.context.json().catch(() => null);
    return { data: details, failed: true as const, message: details?.error || "Something went wrong reading that address." };
  }
  return { data, failed: false as const, message: null };
}

/**
 * Step two of Add source for a what's-on page or calendar feed: preview what's there, then add.
 * New events wait on the Desk (or go straight to Live once Auto-publish is on).
 */
export function EventSourceAddPanel({ topicId, url, onSaved }: { topicId: string; url: string; onSaved: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);

  // Read the page as soon as the step opens: the link is already there.
  useEffect(() => {
    let cancelled = false;
    const target = withScheme(url);
    setPreview(null);
    if (!target) return;
    setBusy("preview");
    callReader({ action: "preview", topicId, url: target }).then((res) => {
      if (cancelled) return;
      setBusy(null);
      if (res.failed) {
        setPreview({ kind: "whats_on_page", found: 0, name: "", error: res.message, examples: [] });
        return;
      }
      setPreview(res.data);
      setName(res.data?.name ?? "");
    });
    return () => { cancelled = true; };
  }, [topicId, url]);

  const save = async () => {
    setBusy("save");
    const res = await callReader({ action: "save", topicId, url: withScheme(url), name: name.trim() || undefined, kind: preview?.kind });
    setBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't add this source", description: res.message, variant: "destructive" });
      return;
    }
    toast({ title: `${eventSourceKindLabel(res.data?.kind)} added` });
    queryClient.invalidateQueries({ queryKey: ["event-desk", topicId] });
    onSaved();
  };

  const example = preview?.examples?.[0] ?? null;
  const usable = preview && (preview.found > 0 || (preview.excluded ?? 0) > 0);

  if (!preview) {
    return (
      <p className="flex items-center gap-2 text-base text-muted-foreground" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Reading…
      </p>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <p className={preview.found > 0 ? "text-base" : "text-base text-muted-foreground"}>
        {preview.found > 0
          ? previewSentence(preview.found, example)
          : (preview.excluded ?? 0) > 0
            ? "None of the events here are in your area."
            : preview.error || previewSentence(0)}
      </p>
      {preview.found > 0 && hiddenSentence(preview.excluded) && <p className="text-sm text-muted-foreground">{hiddenSentence(preview.excluded)}</p>}
      {usable && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="events-source-name" className="text-sm">Name</Label>
            <Input id="events-source-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <Button onClick={save} disabled={busy !== null}>
            {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Add
          </Button>
        </>
      )}
    </div>
  );
}

export interface EventSourceCardData extends EventSource {
  verdict: HealthVerdict;
  upcoming: number;
  dots: number[];
}

const lastSevenDays = () => Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/London" }));

/**
 * The feed's events sources for the Sources tab: health, 7-day dots (new events per day),
 * how many are coming up in the feed, and the owner actions. Event items live on the Desk.
 */
export function useEventSourcesDeck(topicId: string | undefined, reloadKey = 0) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<EventSourceCardData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!topicId) return;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [{ data: rows }, { data: evs }, { data: fresh }] = await Promise.all([
      supabase.from("event_sources").select("id, url, name, kind, auto_publish, is_active, last_checked_at, last_error, consecutive_empty_checks").eq("topic_id", topicId).order("created_at"),
      supabase.from("events").select("event_source_id").eq("topic_id", topicId).eq("status", "published").not("event_source_id", "is", null).gte("start_date", londonToday()).limit(2000),
      supabase.from("events").select("event_source_id, created_at").eq("topic_id", topicId).not("event_source_id", "is", null).gte("created_at", since).limit(2000),
    ]);
    const counts: Record<string, number> = {};
    for (const e of (evs as any[]) ?? []) counts[e.event_source_id] = (counts[e.event_source_id] ?? 0) + 1;
    const days = lastSevenDays();
    const perDay: Record<string, number[]> = {};
    for (const e of (fresh as any[]) ?? []) {
      const d = new Date(e.created_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      const idx = days.indexOf(d);
      if (idx < 0) continue;
      (perDay[e.event_source_id] ??= Array(7).fill(0))[idx] += 1;
    }
    setSources(((rows as unknown as EventSource[]) ?? []).map((s) => ({
      ...s,
      upcoming: counts[s.id] ?? 0,
      dots: perDay[s.id] ?? Array(7).fill(0),
      verdict: eventSourceHealth({ consecutiveEmptyChecks: s.consecutive_empty_checks, lastCheckedAt: s.last_checked_at, upcoming: counts[s.id] ?? 0 }),
    })));
  }, [topicId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const changed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["event-desk", topicId] });
    queryClient.invalidateQueries({ queryKey: ["whats-on", topicId] });
    load();
  }, [queryClient, topicId, load]);

  const setAutoPublish = async (s: EventSource, on: boolean) => {
    setSources((list) => list.map((x) => (x.id === s.id ? { ...x, auto_publish: on } : x)));
    const { data, error } = await (supabase.rpc as any)("set_event_source_auto_publish", { p_source_id: s.id, p_on: on });
    if (error) {
      setSources((list) => list.map((x) => (x.id === s.id ? { ...x, auto_publish: !on } : x)));
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
      return;
    }
    const moved = Number(data) || 0;
    toast({ title: on ? "Auto-publish on" : "Auto-publish off", description: on ? (moved ? `${moved} waiting from ${s.name} went Live.` : `New events from ${s.name} go straight to Live.`) : `New events from ${s.name} wait on your Desk.` });
    changed();
  };

  const saveEdit = async (s: EventSource, name: string, url: string) => {
    const newUrl = withScheme(url);
    const body: Record<string, unknown> = { action: "update", sourceId: s.id };
    if (name.trim() && name.trim() !== s.name) body.name = name.trim();
    if (newUrl && newUrl !== s.url) body.url = newUrl;
    if (!body.name && !body.url) return true;
    setBusy(s.id);
    const res = await callReader(body);
    setBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't save changes", description: res.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Saved", description: body.url ? previewSentence(res.data?.found ?? 0) : undefined });
    changed();
    return true;
  };

  /** The one Gather: check this source now. */
  const gather = async (s: EventSource) => {
    setBusy(s.id);
    const res = await callReader({ action: "refresh", sourceId: s.id });
    setBusy(null);
    if (res.failed) toast({ title: "Couldn't check this source", description: res.message, variant: "destructive" });
    else toast({ title: "Checked", description: previewSentence(res.data?.found ?? 0) });
    changed();
  };

  const setActive = async (s: EventSource, active: boolean) => {
    setBusy(s.id);
    const { error } = await supabase.from("event_sources").update({ is_active: active, updated_at: new Date().toISOString() } as any).eq("id", s.id);
    setBusy(null);
    if (error) { toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" }); return; }
    toast({ title: active ? "Restored" : "Archived", description: active ? `${s.name} is checked again twice a day.` : `${s.name} won't be checked. Events already in your feed stay until they've happened.` });
    changed();
  };

  const remove = async (s: EventSource) => {
    if (!confirm(`Remove ${s.name}? Its upcoming events will come off your feed and weekly email.`)) return false;
    setBusy(s.id);
    const res = await callReader({ action: "remove", sourceId: s.id });
    setBusy(null);
    if (res.failed) { toast({ title: "Couldn't remove this source", description: res.message, variant: "destructive" }); return false; }
    changed();
    return true;
  };

  return { sources, busy, setAutoPublish, saveEdit, gather, archive: (s: EventSource) => setActive(s, false), restore: (s: EventSource) => setActive(s, true), remove, reload: load };
}

type Deck = ReturnType<typeof useEventSourcesDeck>;

/** Everything about one events source, in the same right-hand panel the Desk uses. */
export function EventSourcePanel({ source, deck, onClose }: { source: EventSourceCardData | null; deck: Deck; onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => { setName(source?.name ?? ""); setUrl(source?.url ?? ""); }, [source?.id, source?.name, source?.url]);
  const busy = Boolean(source && deck.busy === source.id);
  const archived = source?.is_active === false;
  const changed = source && (name.trim() !== source.name || withScheme(url) !== source.url);

  return (
    <Sheet open={Boolean(source)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {source && (
          <>
            <SheetHeader className="space-y-4 p-6 pr-12 text-left">
              <div className="flex items-center gap-3">
                <SourceIcon domain={host(source.url)} kind="events" size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-xl leading-snug">{source.name}</SheetTitle>
                  <SheetDescription asChild>
                    <p className="truncate text-sm text-muted-foreground">
                      {eventSourceKindLabel(source.kind)} ·{" "}
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                        {host(source.url)}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </p>
                  </SheetDescription>
                </div>
              </div>
              {archived ? <p className="rounded-lg bg-muted p-3 text-base">Archived. It isn't checked until you restore it.</p> : <HealthLine verdict={source.verdict} />}
              <div className="flex flex-wrap gap-2">
                {archived ? (
                  <Button onClick={() => deck.restore(source)} disabled={busy}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Restore</Button>
                ) : (
                  <Button onClick={() => deck.gather(source)} disabled={busy}>
                    <RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />{busy ? "Checking…" : "Gather now"}
                  </Button>
                )}
              </div>
            </SheetHeader>

            <PanelSection title="Last 7 days">
              <SourceDots counts={source.dots} size="lg" />
              <div className="grid grid-cols-2 gap-2">
                <Figure value={source.dots.reduce((a, b) => a + b, 0)} label="new events found" />
                <Figure value={source.upcoming} label="coming up in the feed" />
              </div>
              <p className="text-base text-muted-foreground">
                Last checked: {source.last_checked_at ? formatDistanceToNow(new Date(source.last_checked_at), { addSuffix: true }) : "not yet"}
              </p>
            </PanelSection>

            {source.last_error && (
              <PanelSection title="Last problem">
                <p className="rounded-lg bg-destructive/5 p-3 text-base text-muted-foreground">{source.last_error}</p>
              </PanelSection>
            )}

            <PanelSection title="Publishing">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-1.5">
                  <Label htmlFor={`auto-${source.id}`} className="text-base font-normal leading-snug">Auto-publish</Label>
                  <InfoTip label="About auto-publish">{source.auto_publish ? "New events go straight to Live." : "New events wait for your OK on the Desk."}</InfoTip>
                </div>
                <Switch id={`auto-${source.id}`} checked={source.auto_publish} onCheckedChange={(on) => deck.setAutoPublish(source, on)} />
              </div>
            </PanelSection>

            <PanelSection title="Settings">
              <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await deck.saveEdit(source, name, url); }}>
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${source.id}`} className="text-sm text-muted-foreground">Name</Label>
                  <Input id={`name-${source.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`url-${source.id}`} className="text-sm text-muted-foreground">Link</Label>
                  <Input id={`url-${source.id}`} inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <Button type="submit" variant="outline" disabled={!changed || busy}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}Save changes
                </Button>
              </form>
            </PanelSection>

            <PanelSection title="More">
              <div className="flex flex-wrap gap-2">
                {!archived && <Button variant="outline" onClick={() => deck.archive(source)} disabled={busy}><Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />Archive</Button>}
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busy}
                  onClick={async () => { if (await deck.remove(source)) onClose(); }}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Remove
                </Button>
              </div>
            </PanelSection>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
