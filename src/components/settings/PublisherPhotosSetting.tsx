import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InfoHint, SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  topicId: string;
  /** On unless turned off. */
  value: boolean | null | undefined;
  onSaved: (values: Record<string, unknown>) => void;
}

/** "Publisher photos" on/off. Off: new stories never take the source's photo, so they get illustrations. Auto-saves. */
export function PublisherPhotosSetting({ topicId, value, onSaved }: Props) {
  const [state, setState] = useState<SaveState>(null);
  const on = value !== false;

  const save = async (next: boolean) => {
    setState("saving");
    const { error } = await supabase
      .from("topics")
      .update({ use_publisher_photos: next, updated_at: new Date().toISOString() } as never)
      .eq("id", topicId);
    if (error) { setState("not-saved"); return; }
    onSaved({ use_publisher_photos: next });
    setState("saved");
  };

  return (
    <div className="flex items-center justify-between gap-4 sm:max-w-sm">
      <div className="flex items-center gap-1">
        <Label htmlFor="publisher-photos" className="text-sm font-medium">Publisher photos</Label>
        <InfoHint label="About publisher photos">
          On: a story can use the source's own photo, always credited. Off: new stories get illustrations only.
        </InfoHint>
      </div>
      <div className="flex items-center gap-3">
        <SaveIndicator state={state} />
        <Switch id="publisher-photos" checked={on} onCheckedChange={(next) => void save(next)} />
      </div>
    </div>
  );
}
