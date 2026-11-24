import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingRow } from "@/components/settings/SettingRow";
import { cn } from "@/lib/utils";

type Mode = "single" | "cycle" | "random";
const MODES: [Mode, string][] = [["single", "One"], ["cycle", "Cycle"], ["random", "Random"]];

/** Picture colours: one colour (the feed colour from Look), a cycle of chosen colours, or random. */
export function PictureColourSetting({ topicId, brandingConfig, onSaved }: {
  topicId: string;
  brandingConfig: unknown;
  onSaved: (values: { branding_config: Record<string, unknown> }) => void;
}) {
  const cfg = ((brandingConfig as Record<string, unknown>) || {}) as Record<string, unknown>;
  const [mode, setMode] = useState<Mode>((cfg["illustration_color_mode"] as Mode) || "single");
  const [palette, setPalette] = useState<string[]>(Array.isArray(cfg["illustration_color_palette"]) ? (cfg["illustration_color_palette"] as string[]) : []);
  const [state, setState] = useState<SaveState>(null);
  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [brandingConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: { illustration_color_mode?: Mode; illustration_color_palette?: string[] }) => {
    setState("saving");
    const branding_config = { ...cfgRef.current, ...next, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("topics").update({ branding_config, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) { setState("not-saved"); return; }
    cfgRef.current = branding_config;
    onSaved({ branding_config });
    setState("saved");
  };

  const pickMode = (m: Mode) => { if (m === mode) return; setMode(m); void save({ illustration_color_mode: m }); };
  const setColours = (next: string[]) => { setPalette(next); void save({ illustration_color_palette: next }); };

  return (
    <>
      <SettingRow label="Picture colours" hint={mode === "single" ? "Uses the feed colour from Look." : mode === "cycle" ? "Takes turns through your colours." : "A different colour each time."}>
        <SaveIndicator state={state} />
        <div className="inline-flex rounded-lg border border-border p-1" role="radiogroup" aria-label="Picture colours">
          {MODES.map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pickMode(m)}
              className={cn("min-h-9 rounded-md px-3 text-base transition-colors", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </SettingRow>
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
