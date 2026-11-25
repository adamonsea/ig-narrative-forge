import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";
import { HANDLE_PATTERN } from "@/lib/feedHandle";

type Verdict = "ok" | "invalid" | "taken" | "checking" | null;
const NOTE: Record<Exclude<Verdict, null | "ok">, string> = {
  invalid: "3–30 lowercase letters, numbers or hyphens.",
  taken: "Taken.",
  checking: "Checking…",
};

/** Settings → General: the feed's handle (curatr.pro/@slug). Old handles keep redirecting. */
export function FeedHandleSetting({ topicId, slug, onChanged }: { topicId: string; slug: string; onChanged: (slug: string) => void }) {
  const [value, setValue] = useState(slug);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [state, setState] = useState<SaveState>(null);

  useEffect(() => { setValue(slug); }, [slug]);

  useEffect(() => {
    if (value === slug) { setVerdict(null); return; }
    if (!HANDLE_PATTERN.test(value)) { setVerdict("invalid"); return; }
    setVerdict("checking");
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("check_feed_handle" as never, { p_topic_id: topicId, p_slug: value } as never);
      setVerdict(error ? null : (data as Verdict));
    }, 300);
    return () => clearTimeout(t);
  }, [value, slug, topicId]);

  const save = async () => {
    if (value === slug || verdict !== "ok") return;
    setState("saving");
    const { data, error } = await supabase.rpc("set_feed_handle" as never, { p_topic_id: topicId, p_slug: value } as never);
    if (error || data !== "ok") { setState("not-saved"); if (data) setVerdict(data as Verdict); return; }
    setState("saved");
    onChanged(value);
  };

  const note = verdict && verdict !== "ok" ? NOTE[verdict] : null;
  return (
    <SettingGroup>
      <SettingRow id="handle" label="Handle" hint={note ?? undefined}>
        <SaveIndicator state={state} />
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}
          className="flex h-11 w-full items-center rounded-lg border border-input bg-background px-3 text-base focus-within:ring-2 focus-within:ring-ring sm:w-72">
          <span className="text-muted-foreground" aria-hidden="true">curatr.pro/@</span>
          <input aria-label="Handle" aria-invalid={verdict === "invalid" || verdict === "taken"} value={value} spellCheck={false} autoCapitalize="none"
            maxLength={30} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, "-"))} onBlur={() => void save()}
            className="min-w-0 flex-1 bg-transparent outline-none" />
        </form>
      </SettingRow>
    </SettingGroup>
  );
}
