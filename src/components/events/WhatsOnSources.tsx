import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarDays, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { eventSourceKindLabel, isBrokenWhatsOnSource, previewSentence } from "@/lib/whatsOn";

interface EventSource {
  id: string;
  url: string;
  name: string;
  kind: string;
  last_checked_at: string | null;
  last_error: string | null;
  consecutive_empty_checks: number;
}

interface Preview {
  kind: string;
  found: number;
  name: string;
  error: string | null;
  examples: { title: string; start_date: string }[];
}

const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

const withScheme = (raw: string) => {
  const t = raw.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
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
 * The one home for events: the Events switch, the "Show in the feed" tick box,
 * and every events source (what's-on pages and calendar feeds) in one list.
 */
export function WhatsOnSources({ topicId }: { topicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<EventSource[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, number>>({});
  const [eventsOn, setEventsOn] = useState<boolean | null>(null);
  const [showInFeed, setShowInFeed] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: rows }, { data: evs }, { data: topic }, { data: insight }] = await Promise.all([
      supabase.from("event_sources").select("id, url, name, kind, last_checked_at, last_error, consecutive_empty_checks").eq("topic_id", topicId).order("created_at"),
      supabase.from("events").select("event_source_id").eq("topic_id", topicId).eq("status", "published").not("event_source_id", "is", null).gte("start_date", today).limit(1000),
      supabase.from("topics").select("events_enabled").eq("id", topicId).maybeSingle(),
      supabase.from("topic_insight_settings").select("events_cards_enabled").eq("topic_id", topicId).maybeSingle(),
    ]);
    setSources((rows as unknown as EventSource[]) ?? []);
    const counts: Record<string, number> = {};
    for (const e of (evs as any[]) ?? []) {
      const id = e.event_source_id as string;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    setUpcoming(counts);
    setEventsOn(Boolean((topic as any)?.events_enabled));
    setShowInFeed(Boolean((insight as any)?.events_cards_enabled));
  }, [topicId]);

  useEffect(() => { load(); }, [load]);

  const toggleEvents = async (checked: boolean) => {
    const before = eventsOn;
    setEventsOn(checked);
    const { error } = await supabase.from("topics").update({ events_enabled: checked, updated_at: new Date().toISOString() } as any).eq("id", topicId);
    if (error) {
      setEventsOn(before);
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    }
  };

  const toggleShowInFeed = async (checked: boolean) => {
    const before = showInFeed;
    setShowInFeed(checked);
    const { data, error } = await supabase.from("topic_insight_settings").update({ events_cards_enabled: checked } as any).eq("topic_id", topicId).select("topic_id");
    let failed = Boolean(error);
    if (!error && (!data || data.length === 0)) {
      const { error: insertError } = await supabase.from("topic_insight_settings").insert({ topic_id: topicId, events_cards_enabled: checked } as any);
      failed = Boolean(insertError);
    }
    if (failed) {
      setShowInFeed(before);
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["topic-insight-settings", topicId] });
  };

  const reset = () => { setAdding(false); setUrl(""); setName(""); setPreview(null); };

  const runPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = withScheme(url);
    if (!target) return;
    setUrl(target);
    setBusy("preview");
    setPreview(null);
    const res = await callReader({ action: "preview", topicId, url: target });
    setBusy(null);
    if (res.failed) {
      setPreview({ kind: "whats_on_page", found: 0, name: "", error: res.message, examples: [] });
      return;
    }
    setPreview(res.data);
    setName(res.data?.name ?? "");
  };

  const save = async () => {
    setBusy("save");
    const res = await callReader({ action: "save", topicId, url: url.trim(), name: name.trim() || undefined, kind: preview?.kind });
    setBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't save this source", description: res.message, variant: "destructive" });
      return;
    }
    toast({ title: `${eventSourceKindLabel(res.data?.kind)} added`, description: previewSentence(res.data?.found ?? 0) });
    reset();
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const s = sources.find((x) => x.id === editing.id);
    if (!s) return;
    const newUrl = withScheme(editing.url);
    const body: Record<string, unknown> = { action: "update", sourceId: s.id };
    if (editing.name.trim() && editing.name.trim() !== s.name) body.name = editing.name.trim();
    if (newUrl && newUrl !== s.url) body.url = newUrl;
    if (!body.name && !body.url) { setEditing(null); return; }
    setRowBusy(s.id);
    const res = await callReader(body);
    setRowBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't save changes", description: res.message, variant: "destructive" });
      return;
    }
    if (body.url) toast({ title: "Saved", description: previewSentence(res.data?.found ?? 0) });
    setEditing(null);
    load();
  };

  const refresh = async (s: EventSource) => {
    setRowBusy(s.id);
    const res = await callReader({ action: "refresh", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't check this source", description: res.message, variant: "destructive" });
    else toast({ title: "Checked", description: previewSentence(res.data?.found ?? 0) });
    load();
  };

  const remove = async (s: EventSource) => {
    if (!confirm(`Remove ${s.name}? Its upcoming events will come off your feed and weekly email.`)) return;
    setRowBusy(s.id);
    const res = await callReader({ action: "remove", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't remove this source", description: res.message, variant: "destructive" });
    load();
  };

  const example = preview?.examples?.[0] ?? null;

  return (
    <section aria-labelledby="whats-on-heading" className="space-y-5 border-t pt-8">
      <h2 id="whats-on-heading" className="flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
        What's on
      </h2>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="events-enabled" className="text-base font-medium">Events</Label>
            <p className="text-sm text-muted-foreground">Collects events from the sources below and adds them to the weekly email.</p>
          </div>
          <Switch id="events-enabled" checked={!!eventsOn} disabled={eventsOn === null} onCheckedChange={toggleEvents} />
        </div>
        <div className="flex items-start gap-3 border-t pt-3">
          <Checkbox
            id="events-show-in-feed"
            checked={!!showInFeed}
            disabled={!eventsOn || showInFeed === null}
            onCheckedChange={(v) => toggleShowInFeed(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="events-show-in-feed" className={eventsOn ? "" : "text-muted-foreground"}>Show in the feed</Label>
            <p className="text-sm text-muted-foreground">Readers see upcoming events between stories.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Events sources</h3>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add an events source
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-4 rounded-xl border p-4">
          <form onSubmit={runPreview} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="events-source-url" className="sr-only">Events source address</Label>
            <Input
              id="events-source-url"
              type="text"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
              placeholder="Paste a what's-on page or calendar feed address"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!url.trim() || busy !== null}>
                {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {busy === "preview" ? "Reading…" : "Preview"}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </form>

          {preview && (
            <div className="space-y-3" aria-live="polite">
              {preview.found > 0 && (
                <p className="text-sm text-muted-foreground">{eventSourceKindLabel(preview.kind)}</p>
              )}
              <p className={preview.found > 0 ? "text-base" : "text-sm text-muted-foreground"}>
                {preview.found > 0 ? previewSentence(preview.found, example) : preview.error || previewSentence(0)}
              </p>
              {preview.found > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="events-source-name" className="text-sm text-muted-foreground">Shown to readers as</Label>
                    <Input id="events-source-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                  </div>
                  <Button onClick={save} disabled={busy !== null}>
                    {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {sources.map((s) => {
            const broken = isBrokenWhatsOnSource(s.consecutive_empty_checks);
            const isEditing = editing?.id === s.id;
            return (
              <li key={s.id} className="p-4">
                {isEditing ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`name-${s.id}`} className="text-sm text-muted-foreground">Shown to readers as</Label>
                      <Input id={`name-${s.id}`} value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`url-${s.id}`} className="text-sm text-muted-foreground">Address</Label>
                      <Input id={`url-${s.id}`} inputMode="url" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={rowBusy === s.id}>
                        {rowBusy === s.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {eventSourceKindLabel(s.kind)} ·{" "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{host(s.url)}</a>
                      </p>
                      {broken ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-destructive">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          No events found on the last two checks. The address may have moved.
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {upcoming[s.id] ?? 0} upcoming
                          {s.last_checked_at ? ` · checked ${formatDistanceToNow(new Date(s.last_checked_at), { addSuffix: true })}` : " · not checked yet"}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Check ${s.name} now`} disabled={rowBusy !== null} onClick={() => refresh(s)}>
                        <RefreshCw className={`h-4 w-4 ${rowBusy === s.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} disabled={rowBusy !== null} onClick={() => setEditing({ id: s.id, name: s.name, url: s.url })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`} disabled={rowBusy !== null} onClick={() => remove(s)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
