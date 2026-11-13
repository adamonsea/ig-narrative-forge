import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PACE_LABELS, paceFields, paceOf, type Pace, type PaceFields } from "@/lib/autopilotPace";
import { cn } from "@/lib/utils";

const OTHER_MODES: Record<string, string> = {
  manual: "Currently hands-on: nothing is collected or published until you start it.",
  auto_gather: "Currently collecting new stories for you to review and publish.",
  auto_simplify: "Currently preparing strong stories and holding them for your review.",
  auto_illustrate: "Currently preparing stories with pictures and holding them for your review.",
};

/** One Autopilot switch plus a pace. Fine-grained modes stay in More options. */
export function AutopilotBasics({ topicId, onChanged }: { topicId: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("manual");
  const [illustrateInHoliday, setIllustrateInHoliday] = useState(true);
  const [frequency, setFrequency] = useState(12);
  const [pace, setPace] = useState<PaceFields>({ drip_feed_enabled: false });
  const [state, setState] = useState<SaveState>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: settings }, { data: topic }] = await Promise.all([
        supabase.from("topic_automation_settings").select("automation_mode, auto_illustrate_in_holiday, scrape_frequency_hours").eq("topic_id", topicId).maybeSingle(),
        supabase.from("topics").select("drip_feed_enabled, drip_release_interval_hours, drip_stories_per_release, drip_start_hour, drip_end_hour").eq("id", topicId).maybeSingle(),
      ]);
      if (!alive) return;
      setMode(settings?.automation_mode || "manual");
      setIllustrateInHoliday(settings?.auto_illustrate_in_holiday ?? true);
      setFrequency(settings?.scrape_frequency_hours || 12);
      if (topic) setPace(topic as PaceFields);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [topicId]);

  const on = mode === "holiday";
  const currentPace = paceOf(pace);

  const done = () => {
    setState("saved");
    onChanged?.();
    window.setTimeout(() => setState(null), 2000);
  };
  const fail = (message: string) => {
    setState("not-saved");
    toast({ title: "Not saved", description: message, variant: "destructive" });
  };

  const toggle = async (next: boolean) => {
    const previous = mode;
    setMode(next ? "holiday" : "auto_gather");
    setState("saving");
    const nextRun = new Date(Date.now() + frequency * 3600 * 1000).toISOString();
    const automation = next
      ? { automation_mode: "holiday", is_active: true, auto_simplify_enabled: true, auto_illustrate_enabled: illustrateInHoliday, next_run_at: nextRun }
      : { automation_mode: "auto_gather", is_active: true, auto_simplify_enabled: false, auto_illustrate_enabled: false, next_run_at: nextRun };
    const [a, t] = await Promise.all([
      supabase.from("topic_automation_settings").update({ ...automation, updated_at: new Date().toISOString() }).eq("topic_id", topicId),
      // The story writer reads this flag to put finished stories live. Turning Autopilot on
      // makes sure it is set; turning it off leaves it as it was, so stories the owner
      // writes by hand keep behaving exactly as before.
      next
        ? supabase.from("topics").update({ auto_simplify_enabled: true, updated_at: new Date().toISOString() }).eq("id", topicId)
        : Promise.resolve({ error: null }),
    ]);
    if (a.error || t.error) { setMode(previous); fail((a.error || t.error)!.message); return; }
    done();
  };

  const choosePace = async (choice: Pace) => {
    const previous = pace;
    const fields = paceFields(choice);
    setPace({ ...pace, ...fields });
    setState("saving");
    const { error } = await supabase.from("topics").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", topicId);
    if (error) { setPace(previous); fail(error.message); return; }
    done();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <label htmlFor="autopilot" className="text-base font-semibold">Autopilot</label>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            {on
              ? "On: new stories are collected, written and published without you. You can still edit, reorder or remove anything on the Desk."
              : OTHER_MODES[mode] || "Off: new stories wait on your Desk for you to publish."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={state} />
          <Switch id="autopilot" checked={on} onCheckedChange={toggle} className="mt-1" />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium" id="pace-label">Publishing pace</p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="pace-label">
          {(Object.keys(PACE_LABELS) as Pace[]).map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={currentPace === choice}
              onClick={() => choosePace(choice)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                currentPace === choice ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <span className="block text-sm font-medium">{PACE_LABELS[choice].label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{PACE_LABELS[choice].hint}</span>
            </button>
          ))}
        </div>
        {currentPace === null && (
          <p className="text-xs text-muted-foreground">You have a custom pace. Change it under More options, or pick one above.</p>
        )}
      </div>
    </div>
  );
}
