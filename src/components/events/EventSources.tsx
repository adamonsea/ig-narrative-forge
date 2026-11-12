import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarDays, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { eventSourceKindLabel, hiddenSentence, isBrokenWhatsOnSource, londonToday, previewSentence } from "@/lib/whatsOn";

interface EventSource {
  id: string;
  url: string;
  name: string;
  kind: string;
  auto_publish: boolean;
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

const host = (url: string) => {
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
 * Adding an events source from the one "Add a source" box, once the pasted link looks
 * like a what's-on page or calendar feed: preview what's there, then save.
 * New events wait on the Desk (or go straight to Live once Auto-publish is on).
 */
export function EventSourceAddPanel({ topicId, url, onSaved }: { topicId: string; url: string; onSaved: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);

  useEffect(() => { setPreview(null); }, [url]);

  const runPreview = async () => {
    const target = withScheme(url);
    if (!target) return;
    setBusy("preview");
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
    const res = await callReader({ action: "save", topicId, url: withScheme(url), name: name.trim() || undefined, kind: preview?.kind });
    setBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't save this source", description: res.message, variant: "destructive" });
      return;
    }
    toast({ title: `${eventSourceKindLabel(res.data?.kind)} added`, description: "Its events are waiting on your Desk." });
    queryClient.invalidateQueries({ queryKey: ["event-desk", topicId] });
    onSaved();
  };

  const example = preview?.examples?.[0] ?? null;
  const usable = preview && (preview.found > 0 || (preview.excluded ?? 0) > 0);

  return (
    <div className="space-y-3 rounded-xl border p-4" aria-live="polite">
      {!preview ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Looks like an events source. Its events will come to your Desk.</p>
          <Button onClick={runPreview} disabled={busy !== null || !url.trim()}>
            {busy === "preview" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy === "preview" ? "Reading…" : "Preview events"}
          </Button>
        </div>
      ) : (
        <>
          {preview.found > 0 && <p className="text-sm text-muted-foreground">{eventSourceKindLabel(preview.kind)}</p>}
          <p className={preview.found > 0 ? "text-base" : "text-sm text-muted-foreground"}>
            {preview.found > 0
              ? previewSentence(preview.found, example)
              : (preview.excluded ?? 0) > 0
                ? "None of the events here are in your area."
                : preview.error || previewSentence(0)}
          </p>
          {preview.found > 0 && hiddenSentence(preview.excluded) && <p className="text-sm text-muted-foreground">{hiddenSentence(preview.excluded)}</p>}
          {usable && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="events-source-name" className="text-sm text-muted-foreground">Shown to readers as</Label>
                <Input id="events-source-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
              <Button onClick={save} disabled={busy !== null}>
                {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Events sources in the one Sources list: name, kind, status and Auto-publish. No event items. */
export function EventSourceCards({ topicId, reloadKey = 0 }: { topicId: string; reloadKey?: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<EventSource[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, number>>({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: evs }] = await Promise.all([
      supabase.from("event_sources").select("id, url, name, kind, auto_publish, last_checked_at, last_error, consecutive_empty_checks").eq("topic_id", topicId).order("created_at"),
      supabase.from("events").select("event_source_id").eq("topic_id", topicId).eq("status", "published").not("event_source_id", "is", null).gte("start_date", londonToday()).limit(1000),
    ]);
    setSources((rows as unknown as EventSource[]) ?? []);
    const counts: Record<string, number> = {};
    for (const e of (evs as any[]) ?? []) counts[e.event_source_id] = (counts[e.event_source_id] ?? 0) + 1;
    setUpcoming(counts);
  }, [topicId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ["event-desk", topicId] });
    queryClient.invalidateQueries({ queryKey: ["whats-on", topicId] });
    load();
  };

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
    changed();
  };

  const refresh = async (s: EventSource) => {
    setRowBusy(s.id);
    const res = await callReader({ action: "refresh", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't check this source", description: res.message, variant: "destructive" });
    else toast({ title: "Checked", description: previewSentence(res.data?.found ?? 0) });
    changed();
  };

  const remove = async (s: EventSource) => {
    if (!confirm(`Remove ${s.name}? Its upcoming events will come off your feed and weekly email.`)) return;
    setRowBusy(s.id);
    const res = await callReader({ action: "remove", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't remove this source", description: res.message, variant: "destructive" });
    changed();
  };

  return (
    <>
      {sources.map((s) => {
        const broken = isBrokenWhatsOnSource(s.consecutive_empty_checks);
        const isEditing = editing?.id === s.id;
        return (
          <Card key={s.id}>
            <CardContent className="p-4 sm:p-6">
              {isEditing ? (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
                  <div className="space-y-1">
                    <Label htmlFor={`name-${s.id}`} className="text-sm text-muted-foreground">Shown to readers as</Label>
                    <Input id={`name-${s.id}`} value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`url-${s.id}`} className="text-sm text-muted-foreground">Link</Label>
                    <Input id={`url-${s.id}`} inputMode="url" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={rowBusy === s.id}>
                      {rowBusy === s.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold sm:text-base">{s.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {eventSourceKindLabel(s.kind)} · <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{host(s.url)}</a>
                      </p>
                      {broken ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          No events found on the last two checks. The link may have moved.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {upcoming[s.id] ?? 0} live
                          {s.last_checked_at ? ` · checked ${formatDistanceToNow(new Date(s.last_checked_at), { addSuffix: true })}` : " · not checked yet"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Label htmlFor={`auto-${s.id}`} className="mr-1 text-xs text-muted-foreground">Auto-publish</Label>
                    <Switch id={`auto-${s.id}`} checked={s.auto_publish} onCheckedChange={(on) => setAutoPublish(s, on)} className="mr-2" />
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
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
