import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/SettingRow";

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
    <SettingRow label="Publisher photos" hint="Use the source's own photo, always credited. Off: illustrations only.">
      <SaveIndicator state={state} />
      <Switch id="publisher-photos" aria-label="Publisher photos" checked={on} onCheckedChange={(next) => void save(next)} />
    </SettingRow>
  );
}
