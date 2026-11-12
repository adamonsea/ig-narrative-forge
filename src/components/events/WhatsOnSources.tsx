import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarDays, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { isBrokenWhatsOnSource, previewSentence } from "@/lib/whatsOn";

interface WhatsOnSource {
  id: string;
  url: string;
  name: string;
  last_checked_at: string | null;
  consecutive_empty_checks: number;
}

interface Preview {
  found: number;
  name: string;
  error: string | null;
  examples: { title: string; start_date: string }[];
}

const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

async function callReader(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("scrape-whats-on", { body });
  if (error) {
    let details: any = null;
    if (error instanceof FunctionsHttpError) details = await error.context.json().catch(() => null);
    return { data: details, failed: true as const, message: details?.error || "Something went wrong reading that page." };
  }
  return { data, failed: false as const, message: null };
}

/** "Add a what's-on page" — paste a listings URL, preview what we'd find, save. Events publish automatically. */
export function WhatsOnSources({ topicId }: { topicId: string }) {
  const { toast } = useToast();
  const [sources, setSources] = useState<WhatsOnSource[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, number>>({});
  const [eventsOn, setEventsOn] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: rows }, { data: evs }, { data: topic }] = await Promise.all([
      supabase.from("event_sources").select("id, url, name, last_checked_at, consecutive_empty_checks").eq("topic_id", topicId).order("created_at"),
      supabase.from("events").select("external_id").eq("topic_id", topicId).eq("source_api", "whats_on").eq("status", "published").gte("start_date", today).limit(1000),
      supabase.from("topics").select("events_enabled").eq("id", topicId).maybeSingle(),
    ]);
    setSources((rows as WhatsOnSource[]) ?? []);
    const counts: Record<string, number> = {};
    for (const e of evs ?? []) {
      const id = String((e as any).external_id ?? "").split(":")[0];
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    setUpcoming(counts);
    setEventsOn(Boolean((topic as any)?.events_enabled));
  }, [topicId]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setAdding(false); setUrl(""); setName(""); setPreview(null); };

  const runPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    setUrl(target);
    setBusy("preview");
    setPreview(null);
    const res = await callReader({ action: "preview", topicId, url: target });
    setBusy(null);
    if (res.failed) {
      setPreview({ found: 0, name: "", error: res.message, examples: [] });
      return;
    }
    setPreview(res.data);
    setName(res.data?.name ?? "");
  };

  const save = async () => {
    setBusy("save");
    const res = await callReader({ action: "save", topicId, url: url.trim(), name: name.trim() || undefined });
    setBusy(null);
    if (res.failed) {
      toast({ title: "Couldn't save this page", description: res.message, variant: "destructive" });
      return;
    }
    toast({ title: "What's-on page added", description: `${res.data?.found ?? 0} upcoming events added to your feed.` });
    reset();
    load();
  };

  const refresh = async (s: WhatsOnSource) => {
    setRowBusy(s.id);
    const res = await callReader({ action: "refresh", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't check this page", description: res.message, variant: "destructive" });
    else toast({ title: "Checked", description: previewSentence(res.data?.found ?? 0) });
    load();
  };

  const remove = async (s: WhatsOnSource) => {
    if (!confirm(`Remove ${s.name}? Its upcoming events will come off your feed.`)) return;
    setRowBusy(s.id);
    const res = await callReader({ action: "remove", sourceId: s.id });
    setRowBusy(null);
    if (res.failed) toast({ title: "Couldn't remove this page", description: res.message, variant: "destructive" });
    load();
  };

  const example = preview?.examples?.[0] ?? null;

  return (
    <section aria-labelledby="whats-on-heading" className="space-y-4 border-t pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="whats-on-heading" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          What's-on pages
        </h2>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add a what's-on page
          </Button>
        )}
      </div>

      {eventsOn === false && sources.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Events are switched off for this feed, so readers won't see these yet. Turn on Local Events in Editorial control.
        </p>
      )}

      {adding && (
        <div className="space-y-4 rounded-xl border p-4">
          <form onSubmit={runPreview} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="whats-on-url" className="sr-only">What's-on page address</Label>
            <Input
              id="whats-on-url"
              type="text"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
              placeholder="Paste a venue or listings page, e.g. https://venue.co.uk/whats-on"
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
              <p className={preview.found > 0 ? "text-base" : "text-sm text-muted-foreground"}>
                {preview.found > 0 ? previewSentence(preview.found, example) : preview.error || previewSentence(0)}
              </p>
              {preview.found > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="whats-on-name" className="text-sm text-muted-foreground">Shown to readers as</Label>
                    <Input id="whats-on-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
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
            return (
              <li key={s.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-muted-foreground hover:underline">
                    {host(s.url)}
                  </a>
                  {broken ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      No events found on the last two checks. The page may have moved.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {upcoming[s.id] ?? 0} upcoming
                      {s.last_checked_at ? ` · checked ${formatDistanceToNow(new Date(s.last_checked_at), { addSuffix: true })}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => refresh(s)} disabled={rowBusy === s.id} aria-label={`Check ${s.name} now`}>
                    <RefreshCw className={`h-4 w-4 ${rowBusy === s.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(s)} disabled={rowBusy === s.id} aria-label={`Remove ${s.name}`} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
