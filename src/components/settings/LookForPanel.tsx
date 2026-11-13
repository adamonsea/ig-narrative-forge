import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TermList } from "@/components/feed-setup/TermList";

/** "What we look for": two plain lists plus the Family-safe choice. No scores on screen. */
export function LookForPanel({
  topicId,
  keywords,
  negativeKeywords,
  familySafe,
  onChange,
}: {
  topicId: string;
  keywords: string[];
  negativeKeywords: string[];
  familySafe: boolean;
  onChange: (patch: { keywords?: string[]; negative_keywords?: string[]; family_safe?: boolean }) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<SaveState>(null);

  const save = async (patch: { keywords?: string[]; negative_keywords?: string[]; family_safe?: boolean }) => {
    const previous = { keywords, negative_keywords: negativeKeywords, family_safe: familySafe };
    onChange(patch);
    setState("saving");
    const { error } = await supabase.from("topics").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) {
      onChange(previous);
      setState("not-saved");
      toast({ title: "Not saved", description: error.message, variant: "destructive" });
      return;
    }
    setState("saved");
    window.setTimeout(() => setState(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end"><SaveIndicator state={state} /></div>
      <div className="grid gap-8 md:grid-cols-2">
        <TermList
          label="More of this"
          hint="Stories that mention these belong in the feed."
          terms={keywords}
          onChange={(next) => save({ keywords: next })}
        />
        <TermList
          label="Less of this"
          hint="Stories about these are left out."
          tone="less"
          terms={negativeKeywords}
          onChange={(next) => save({ negative_keywords: next })}
        />
      </div>
      <div className="flex items-start justify-between gap-6 border-t border-border pt-6">
        <div>
          <label htmlFor="family-safe" className="text-base font-semibold">Family-safe</label>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            Leaves out adult, violent and gambling stories before they're written. Usually off for news feeds, where crime and courts are core reporting.
          </p>
        </div>
        <Switch id="family-safe" checked={familySafe} onCheckedChange={(v) => save({ family_safe: v })} className="mt-1" />
      </div>
    </div>
  );
}
