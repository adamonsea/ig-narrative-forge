import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BRAND_COLOURS, PICTURE_LABELS, type FeedSetupDraft, type PictureChoice } from "@/lib/feedSetup";
import { TermList } from "./TermList";
import { FEATURES } from "@/lib/featureFlags";
import { addToList, normaliseTerm, removeTerm, type ListName } from "@/lib/termLists";

export interface SetupSource {
  url: string;
  source_name: string;
  type: string;
  confidence_score: number;
  rationale: string;
  platform_reliability?: "high" | "medium" | "low";
}

const DRAWN_CHOICES: PictureChoice[] = ["editorial_illustrative", "editorial_photographic", "illustrated_icon"];

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border py-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({ id, title, hint, checked, onChange }: { id: string; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <section className="flex items-start justify-between gap-6 border-t border-border py-6">
      <div>
        <label htmlFor={id} className="text-base font-semibold">{title}</label>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-1" />
    </section>
  );
}

/** One screen showing everything Curatr suggests. Every part changes with one tap. */
export function FeedSetupPreview({
  draft,
  onChange,
  sources,
  selected,
  onToggleSource,
  onAddSource,
  nameLocked = false,
}: {
  draft: FeedSetupDraft;
  onChange: (next: FeedSetupDraft) => void;
  sources: SetupSource[];
  selected: Set<string>;
  onToggleSource: (url: string) => void;
  onAddSource: (url: string) => string | null;
  nameLocked?: boolean;
}) {
  const [newSource, setNewSource] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const set = <K extends keyof FeedSetupDraft>(key: K, value: FeedSetupDraft[K]) => onChange({ ...draft, [key]: value });
  const [moved, setMoved] = useState<{ list: ListName; text: string } | null>(null);
  // A term lives in one list only: adding it to one moves it out of the other.
  const addTo = (list: ListName, term: string) => {
    const r = addToList({ more: draft.keywords, less: draft.negative_keywords }, list, term);
    if (!r.added) return;
    onChange({ ...draft, keywords: r.more, negative_keywords: r.less });
    setMoved(r.movedFrom ? { list, text: `“${normaliseTerm(term)}” moved from ${r.movedFrom === "more" ? "More of this" : "Less of this"}` } : null);
  };
  const addSource = () => {
    const error = onAddSource(newSource);
    setSourceError(error);
    if (!error) setNewSource("");
  };

  return (
    <div className="space-y-0">
      {/* Identity: how readers first meet the feed */}
      <section className="space-y-4 pb-6">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-lg" style={{ background: draft.colour }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor="setup-name" className="sr-only">Feed name</label>
            <Input
              id="setup-name"
              value={draft.name}
              readOnly={nameLocked}
              onChange={(e) => set("name", e.target.value.slice(0, 60))}
              className="h-12 border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:border-border focus-visible:px-3 md:text-3xl"
            />
          </div>
        </div>
        <div>
          <label htmlFor="setup-welcome" className="text-sm text-muted-foreground">Welcome line</label>
          <Input
            id="setup-welcome"
            value={draft.welcome}
            onChange={(e) => set("welcome", e.target.value.slice(0, 110))}
            className="mt-1 h-11 text-base"
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" id="setup-colour">Colour</p>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="setup-colour">
            {BRAND_COLOURS.concat(BRAND_COLOURS.includes(draft.colour) ? [] : [draft.colour]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draft.colour === c}
                aria-label={`Colour ${c}`}
                onClick={() => set("colour", c)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
                  draft.colour === c ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                )}
                style={{ background: c }}
              >
                {draft.colour === c && <Check className="h-4 w-4 text-primary-foreground" aria-hidden="true" />}
              </button>
            ))}
            <label className="ml-1 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
              Custom
              <input type="color" value={draft.colour} onChange={(e) => set("colour", e.target.value.toUpperCase())} className="sr-only" />
            </label>
          </div>
        </div>
      </section>

      <Row title="Sources" hint="Where stories come from. Tap to include or leave out.">
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources found automatically. Add a website below.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sources.map((s) => {
              const on = selected.has(s.url);
              return (
                <li key={s.url}>
                  <button
                    type="button"
                    onClick={() => onToggleSource(s.url)}
                    aria-pressed={on}
                    title={s.rationale}
                    className={cn(
                      "inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground line-through decoration-muted-foreground/50",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
                    <span className="truncate">{s.source_name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={newSource}
            onChange={(e) => { setNewSource(e.target.value); setSourceError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSource(); } }}
            placeholder="Add a website, e.g. example.com"
            aria-label="Add a source website"
            className="h-10"
          />
          <Button type="button" variant="outline" onClick={addSource} disabled={!newSource.trim()} className="h-10 gap-1">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>
        {sourceError && <p className="text-sm text-destructive">{sourceError}</p>}
      </Row>

      <section className="space-y-6 border-t border-border py-6">
        <TermList
          label="More of this"
          hint="Stories that mention these belong in the feed."
          terms={draft.keywords}
          onAdd={(t) => addTo("more", t)}
          onRemove={(t) => set("keywords", removeTerm(draft.keywords, t))}
          notice={moved?.list === "more" ? moved.text : null}
        />
        <TermList
          label="Less of this"
          hint="Stories about these are left out."
          tone="less"
          terms={draft.negative_keywords}
          onAdd={(t) => addTo("less", t)}
          onRemove={(t) => set("negative_keywords", removeTerm(draft.negative_keywords, t))}
          notice={moved?.list === "less" ? moved.text : null}
        />
      </section>

      <Row
        title="Pictures"
        hint={draft.brand_or_fandom
          ? "Each story keeps its source's own photo. Characters and logos are never drawn."
          : "The look of each story's cover picture."}
      >
        {draft.brand_or_fandom ? (
          <p className="text-sm font-medium">{PICTURE_LABELS.source}</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Picture style">
            {DRAWN_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={draft.pictures === choice}
                onClick={() => set("pictures", choice)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  draft.pictures === choice ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {PICTURE_LABELS[choice]}
              </button>
            ))}
          </div>
        )}
      </Row>

      {FEATURES.familySafe && <SwitchRow
        id="setup-family-safe"
        title="Family-safe"
        hint={draft.family_safe
          ? "Leaves out adult, violent and gambling stories. Suggested for this subject."
          : "Off: crime, courts and hard news come through. Turn on to leave out adult, violent and gambling stories."}
        checked={draft.family_safe}
        onChange={(v) => set("family_safe", v)}
      />}
      <SwitchRow
        id="setup-autopilot"
        title="Autopilot"
        hint={draft.autopilot
          ? "New stories from these sources are written and published on their own. You can still edit or remove anything."
          : "New stories wait on your Desk for you to publish."}
        checked={draft.autopilot}
        onChange={(v) => set("autopilot", v)}
      />
    </div>
  );
}
