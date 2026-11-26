import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineError } from "@/components/ui/editorial";
import { cn } from "@/lib/utils";
import { useEditorialProfile } from "@/components/settings/EventCaptionsSettings";
import { AttentionTag } from "@/components/events/DeskEvents";

interface CopyRow { kind: string; language: string; text: string; edited_at: string | null }
interface CapRow { platform: string; text: string; edited_at: string | null }
interface EvRow { genre: string | null; flags: string[]; review_flags: string[] }

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", website: "Website", facebook: "Facebook" };
const LANG_LABEL: Record<string, string> = { "pt-PT": "Português", en: "English" };

/** Captions, synopses, genre, flags and review flags for one event. Shown only when the feed's profile is on. */
export function EventEditorialPanel({ eventId, topicId }: { eventId: string; topicId: string }) {
  const { data: profile } = useEditorialProfile(topicId);
  const qc = useQueryClient();
  const key = ["event-editorial", eventId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: Boolean(profile?.enabled),
    queryFn: async () => {
      const from = supabase.from as any;
      const [ev, ed] = await Promise.all([
        from("events").select("genre, flags, review_flags").eq("id", eventId).maybeSingle(),
        (supabase.rpc as any)("get_event_editorial", { p_event_id: eventId }),
      ]);
      const e = (ed.data ?? {}) as { copy?: CopyRow[]; caps?: CapRow[] };
      return { ev: (ev.data ?? null) as EvRow | null, copy: e.copy ?? [], caps: e.caps ?? [] };
    },
  });
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile?.enabled) return null;
  if (isLoading) return <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />;

  const rpc = (kind: string, k: string, language: string, value: unknown) =>
    (supabase.rpc as any)("save_event_editorial", { p_event_id: eventId, p_kind: kind, p_key: k, p_language: language, p_value: value });
  const saveCaption = async (platform: string, text: string) => {
    const { error: e } = await rpc("caption", platform, "", text);
    if (e) setError("Couldn't save the caption.");
    qc.invalidateQueries({ queryKey: key });
  };
  const saveCopy = async (kind: string, language: string, text: string) => {
    const { error: e } = await rpc("copy", kind, language, text);
    if (e) setError("Couldn't save.");
    qc.invalidateQueries({ queryKey: key });
  };
  const saveEvent = async (field: "genre" | "flags", value: unknown) => {
    const { error: e } = await rpc("field", field, "", value);
    if (e) { setError("Couldn't save."); return; }
    qc.invalidateQueries({ queryKey: key });
  };
  const write = async () => {
    setWriting(true); setError(null);
    const { data: r, error: e } = await supabase.functions.invoke("scrape-whats-on", { body: { action: "editorial_copy", eventId, force: true } });
    setWriting(false);
    if (e || (r as { error?: string })?.error) setError((r as { error?: string })?.error === "Not enough credits" ? "Not enough credits." : "Couldn't write the copy.");
    qc.invalidateQueries({ queryKey: key });
  };

  const ev = data?.ev;
  const caps = new Map((data?.caps ?? []).map((c) => [c.platform, c]));
  const copy = new Map((data?.copy ?? []).map((c) => [`${c.kind}|${c.language}`, c]));
  const platforms = Object.keys(profile.caption_templates);
  const empty = !data?.caps.length;

  return (
    <section className="space-y-6 border-t pt-6" aria-labelledby={`ed-${eventId}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`ed-${eventId}`} className="text-lg font-semibold">Captions</h3>
        <Button variant={empty ? "default" : "ghost"} size="sm" onClick={() => void write()} disabled={writing}>{writing ? "Writing…" : empty ? "Write" : "Redraft"}</Button>
      </div>
      {error && <InlineError message={error} actionLabel="Try again" onAction={() => setError(null)} />}
      {ev?.review_flags?.length ? (
        <div className="flex flex-wrap gap-2">{ev.review_flags.map((f) => <AttentionTag key={f}>{f}</AttentionTag>)}</div>
      ) : null}
      {platforms.map((p) => <CaptionBox key={p} id={`${eventId}-${p}`} label={PLATFORM_LABEL[p] ?? p} row={caps.get(p)} onSave={(t) => void saveCaption(p, t)} />)}
      {profile.languages.map((l) => (
        <TextBox key={l} id={`${eventId}-syn-${l}`} label={LANG_LABEL[l] ?? l} value={copy.get(`synopsis|${l}`)?.text ?? ""} onSave={(t) => void saveCopy("synopsis", l, t)} />
      ))}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Genre</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Genre">
          {profile.genres.map((g) => (
            <button key={g.name} type="button" role="radio" aria-checked={ev?.genre === g.name} onClick={() => void saveEvent("genre", g.name)}
              className={cn("min-h-11 rounded-full border px-4 text-base", ev?.genre === g.name ? "border-primary bg-primary/5 font-medium" : "border-border")}>{g.name}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Flags</p>
        <div className="flex flex-wrap gap-2">
          {profile.flags.map((f) => {
            const on = Boolean(ev?.flags?.includes(f));
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => void saveEvent("flags", on ? ev!.flags.filter((x) => x !== f) : [...(ev?.flags ?? []), f])}
                className={cn("min-h-11 rounded-full border px-4 text-base", on ? "border-primary bg-primary/5 font-medium" : "border-border")}>{f}</button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TextBox({ id, label, value, onSave }: { id: string; label: string; value: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-muted-foreground">{label}</Label>
      <Textarea id={id} rows={5} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text); }} className="text-base leading-relaxed" />
    </div>
  );
}

function CaptionBox({ id, label, row, onSave }: { id: string; label: string; row: CapRow | undefined; onSave: (t: string) => void }) {
  const value = row?.text ?? "";
  const [text, setText] = useState(value);
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(value), [value]);
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm text-muted-foreground">{label}</Label>
        <Button variant="ghost" size="sm" onClick={() => void copy()} disabled={!text} aria-label={`Copy ${label} caption`}>
          {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}{copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Textarea id={id} rows={12} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text); }} className="text-base leading-relaxed" />
    </div>
  );
}
