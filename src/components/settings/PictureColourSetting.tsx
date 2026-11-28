import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingRow } from "@/components/settings/SettingRow";
import { cn } from "@/lib/utils";
import { COLOUR_SETS, RANDOM_SET } from "@/lib/illustrationColourSets";

type Mode = "single" | "cycle" | "random" | "set";
type Tab = "single" | "cycle" | "sets";
const MODES: [Tab, string][] = [["single", "One"], ["cycle", "Cycle"], ["sets", "Sets"]];

/** Picture colours: one colour (the feed colour from Look), a cycle of chosen colours, or random. */
export function PictureColourSetting({ topicId, brandingConfig, onSaved }: {
  topicId: string;
  brandingConfig: unknown;
  onSaved: (values: { branding_config: Record<string, unknown> }) => void;
}) {
  const cfg = ((brandingConfig as Record<string, unknown>) || {}) as Record<string, unknown>;
  const [mode, setMode] = useState<Mode>((cfg["illustration_color_mode"] as Mode) || "single");
  const [palette, setPalette] = useState<string[]>(Array.isArray(cfg["illustration_color_palette"]) ? (cfg["illustration_color_palette"] as string[]) : []);
  const [setChoice, setSetChoice] = useState<string>(mode === "set" && typeof cfg["illustration_color_set"] === "string" ? (cfg["illustration_color_set"] as string) : RANDOM_SET);
  const tab: Tab = mode === "random" || mode === "set" ? "sets" : mode;
  const [state, setState] = useState<SaveState>(null);
  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [brandingConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: { illustration_color_mode?: Mode; illustration_color_palette?: string[]; illustration_color_set?: string }) => {
    setState("saving");
    const branding_config = { ...cfgRef.current, ...next, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("topics").update({ branding_config, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) { setState("not-saved"); return; }
    cfgRef.current = branding_config;
    onSaved({ branding_config });
    setState("saved");
  };

  const pickTab = (t: Tab) => {
    if (t === tab) return;
    const m: Mode = t === "sets" ? (setChoice === RANDOM_SET ? "random" : "set") : t;
    setMode(m); void save({ illustration_color_mode: m });
  };
  const pickSet = (id: string) => {
    const m: Mode = id === RANDOM_SET ? "random" : "set";
    setSetChoice(id); setMode(m);
    void save(id === RANDOM_SET ? { illustration_color_mode: m } : { illustration_color_mode: m, illustration_color_set: id });
  };
  const setColours = (next: string[]) => { setPalette(next); void save({ illustration_color_palette: next }); };

  return (
    <>
      <SettingRow label="Picture colours" hint={tab === "single" ? "Uses the feed colour from Look." : tab === "cycle" ? "Takes turns through your colours." : "One whole set per picture."}>
        <SaveIndicator state={state} />
        <div className="inline-flex rounded-lg border border-border p-1" role="radiogroup" aria-label="Picture colours">
          {MODES.map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={tab === m} onClick={() => pickTab(m)}
              className={cn("min-h-9 rounded-md px-3 text-base transition-colors", tab === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </SettingRow>
      {tab === "sets" && (
        <SettingRow label="Colour set" stack>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour set">
            {[{ id: RANDOM_SET, name: "Random", colours: [] as string[] }, ...COLOUR_SETS].map((set) => {
              const on = setChoice === set.id;
              return (
                <button key={set.id} type="button" role="radio" aria-checked={on} onClick={() => pickSet(set.id)}
                  className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors", on ? "border-purple-bright ring-2 ring-purple-bright/30" : "border-border text-muted-foreground hover:text-foreground")}>
                  {set.id === RANDOM_SET
                    ? <span className="flex -space-x-1" aria-hidden>{COLOUR_SETS.slice(0, 4).map((s) => <span key={s.id} className="h-5 w-5 rounded-full border border-background" style={{ backgroundColor: s.colours[0] }} />)}</span>
                    : <span className="flex overflow-hidden rounded-md border border-border" aria-hidden>{set.colours.map((c) => <span key={c} className="h-5 w-4" style={{ backgroundColor: c }} />)}</span>}
                  {set.name}
                </button>
              );
            })}
          </div>
        </SettingRow>
      )}
      {mode === "cycle" && (
        <SettingRow label="Colours" hint="Tap a colour to remove it." stack>
          <div className="flex flex-wrap items-center gap-2">
            {palette.map((c) => (
              <button key={c} type="button" onClick={() => setColours(palette.filter((x) => x !== c))} aria-label={`Remove ${c}`} title="Remove"
                className="h-11 w-11 rounded-lg border-2 border-primary" style={{ backgroundColor: c }} />
            ))}
            <label className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground" title="Add a colour">
              +
              <input type="color" aria-label="Add a colour" className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => { const v = e.target.value; if (!palette.includes(v)) setColours([...palette, v]); }} />
            </label>
          </div>
        </SettingRow>
      )}
    </>
  );
}
