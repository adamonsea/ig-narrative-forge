import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";

function DaysInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const blur = () => { const n = Math.round(Number(text)); if (Number.isFinite(n) && n >= 0 && n <= 365 && n !== value) onSave(n); else setText(String(value)); };
  return <Input aria-label="Days ahead" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={blur} className="h-11 w-20 text-base" />;
}
import {
  flagsToText, genresToText, textToFlags, textToGenres, textToHashtags, textToLanguages, textToLines, textToTemplate,
} from "@/lib/editorial/profileText";
import type { GenreRule } from "@/lib/editorial/captionAssembler";

interface Profile {
  topic_id: string; enabled: boolean; languages: string[]; caption_templates: Record<string, string[]>;
  fixed_hashtags: string[]; genres: GenreRule[]; flags: string[]; flag_rules: Record<string, string>;
  labels: { free?: string; tickets?: string }; voice_rules: string[]; auto_copy_days: number;
}

export const editorialProfileKey = (topicId: string | undefined) => ["editorial-profile", topicId];

export function useEditorialProfile(topicId: string | undefined) {
  return useQuery({
    queryKey: editorialProfileKey(topicId),
    enabled: Boolean(topicId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_feed_editorial_profile", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });
}

const PLATFORMS: [string, string][] = [["instagram", "Instagram"], ["website", "Website"], ["facebook", "Facebook"]];

/** Field (blur-saves one column). */
function Field({ id, label, value, rows, hide, onSave }: { id: string; label: string; value: string; rows?: number; hide?: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const blur = () => { if (text !== value) onSave(text); };
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={hide ? "sr-only" : "text-sm text-muted-foreground"}>{label}</Label>
      {rows ? <Textarea id={id} rows={rows} value={text} onChange={(e) => setText(e.target.value)} onBlur={blur} className="font-mono text-sm leading-relaxed" />
        : <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={blur} className="text-base" />}
    </div>
  );
}

/** Social captions for events. Off = nothing changes for this feed. */
export function EventCaptionsSettings({ topicId }: { topicId: string }) {
  const qc = useQueryClient();
  const { data: p, isLoading } = useEditorialProfile(topicId);
  const [state, setState] = useState<SaveState>(null);

  const save = async (values: Partial<Profile>) => {
    setState("saving");
    const { error } = await (supabase.rpc as any)("save_feed_editorial_profile", { p_topic_id: topicId, p_values: values });
    setState(error ? "not-saved" : "saved");
    qc.invalidateQueries({ queryKey: editorialProfileKey(topicId) });
  };
  if (isLoading) return <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />;
  const on = Boolean(p?.enabled);

  return (
    <SettingGroup id="social-captions" title="Social captions">
      <SettingRow label="Write captions" hint="Ready-to-post captions and synopses for approved events. 1 credit each.">
        <SaveIndicator state={state} />
        <Switch id="captions-on" aria-label="Write captions" checked={on} onCheckedChange={(v) => void save({ enabled: v })} />
      </SettingRow>
      {on && p && (
        <>
          <SettingRow label="Days ahead" hint="Write automatically for events starting within this many days.">
            <DaysInput value={p.auto_copy_days ?? 14} onSave={(n) => void save({ auto_copy_days: n })} />
          </SettingRow>
          <SettingRow label="Languages" hint="In caption order, e.g. pt-PT, en." stack>
            <Field hide id="cap-langs" label="Languages" value={p.languages.join(", ")} onSave={(v) => void save({ languages: textToLanguages(v) })} />
          </SettingRow>
          <SettingRow label="Templates" hint="One per platform. A line with an empty field is left out." stack>
            <div className="space-y-5">
              {PLATFORMS.map(([key, label]) => (
                <Field key={key} id={`cap-${key}`} label={label} rows={8} value={(p.caption_templates[key] ?? []).join("\n")}
                  onSave={(v) => {
                    const lines = textToTemplate(v);
                    const next = { ...p.caption_templates };
                    if (lines.some((l) => l.trim())) next[key] = lines; else delete next[key];
                    void save({ caption_templates: next });
                  }} />
              ))}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="cap-free" label="Free label" value={p.labels.free ?? ""} onSave={(v) => void save({ labels: { ...p.labels, free: v.trim() } })} />
                <Field id="cap-tickets" label="Tickets label" value={p.labels.tickets ?? ""} onSave={(v) => void save({ labels: { ...p.labels, tickets: v.trim() } })} />
              </div>
            </div>
          </SettingRow>
          <SettingRow label="Hashtags" hint="Always added. 2–4 event hashtags are suggested on top." stack>
            <Field hide id="cap-tags" label="Hashtags" value={p.fixed_hashtags.join(" ")} onSave={(v) => void save({ fixed_hashtags: textToHashtags(v) })} />
          </SettingRow>
          <SettingRow label="Genres" hint="Exactly one per event. One per line: genre: source words." stack>
            <Field hide id="cap-genres" label="Genres" rows={8} value={genresToText(p.genres)} onSave={(v) => void save({ genres: textToGenres(v) })} />
          </SettingRow>
          <SettingRow label="Flags" hint="Optional labels such as Free or Kids." stack>
            <Field hide id="cap-flags" label="Flags" rows={4} value={flagsToText(p.flags, p.flag_rules)} onSave={(v) => void save(textToFlags(v))} />
          </SettingRow>
          <SettingRow label="Voice rules" hint="One rule per line." stack>
            <Field hide id="cap-voice" label="Voice rules" rows={5} value={p.voice_rules.join("\n")} onSave={(v) => void save({ voice_rules: textToLines(v) })} />
          </SettingRow>
        </>
      )}
    </SettingGroup>
  );
}
