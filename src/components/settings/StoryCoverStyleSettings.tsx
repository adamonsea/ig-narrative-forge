import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { resolveStoryCoverStyle, STORY_COVER_LABELS, type StoryCoverStyle } from "@/lib/storyCoverStyle";
import { cn } from "@/lib/utils";

interface Props {
  topicId: string;
  /** Raw saved value; anything unknown reads as 'split'. */
  value: string | null | undefined;
  onSaved: (values: Record<string, unknown>) => void;
}

/** A tiny drawing of each cover: picture above the headline, or picture behind it. */
function CoverPreview({ style }: { style: StoryCoverStyle }) {
  const fullBleed = style === "full-bleed";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block h-24 w-16 overflow-hidden rounded-md border",
        fullBleed ? "border-feed-cover-ink bg-muted" : "border-border bg-background",
      )}
    >
      {fullBleed ? (
        <>
          <span className="absolute inset-x-0 top-0 h-1/2 bg-muted-foreground/25" />
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-feed-cover-ink via-feed-cover-ink/80 to-transparent" />
          <span className="absolute inset-x-1.5 bottom-1.5 space-y-1">
            <span className="block h-1 w-full rounded-full bg-feed-cover-text/90" />
            <span className="block h-1 w-3/4 rounded-full bg-feed-cover-text/90" />
          </span>
        </>
      ) : (
        <>
          <span className="absolute inset-x-0 top-0 h-1/2 bg-muted" />
          <span className="absolute inset-x-1.5 bottom-2 space-y-1">
            <span className="block h-1 w-full rounded-full bg-foreground/70" />
            <span className="block h-1 w-3/4 rounded-full bg-foreground/70" />
          </span>
        </>
      )}
    </span>
  );
}

/**
 * "Story cover: Split | Full bleed" — the two first-slide designs, picked from
 * two drawings. Slides 2+ are the same in both. Auto-saves.
 */
export function StoryCoverStyleSettings({ topicId, value, onSaved }: Props) {
  const [state, setState] = useState<SaveState>(null);
  const current = resolveStoryCoverStyle(value);

  const choose = async (next: StoryCoverStyle) => {
    if (next === current) return;
    setState("saving");
    const { error } = await supabase
      .from("topics")
      .update({ story_cover_style: next, updated_at: new Date().toISOString() } as never)
      .eq("id", topicId);
    if (error) {
      setState("not-saved");
      return;
    }
    onSaved({ story_cover_style: next });
    setState("saved");
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium" id="story-cover-style">Story cover</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm" role="radiogroup" aria-labelledby="story-cover-style">
          {(["split", "full-bleed"] as const).map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={current === style}
              onClick={() => void choose(style)}
              className={cn(
                "flex min-h-11 flex-col items-center gap-2 rounded-lg border p-3 text-base transition-colors",
                current === style
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:border-muted-foreground/40",
              )}
            >
              <CoverPreview style={style} />
              {STORY_COVER_LABELS[style]}
            </button>
          ))}
        </div>
        <SaveIndicator state={state} />
      </div>
    </div>
  );
}
