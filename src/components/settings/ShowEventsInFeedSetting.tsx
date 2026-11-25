import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";

/** Settings → Events: the one "Show in the feed" switch (topic_insight_settings.events_cards_enabled). Auto-saves. */
export function ShowEventsInFeedSetting({ topicId }: { topicId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [state, setState] = useState<SaveState>(null);

  useEffect(() => {
    let live = true;
    supabase.from("topic_insight_settings").select("events_cards_enabled").eq("topic_id", topicId).maybeSingle()
      .then(({ data }) => { if (live) setOn(Boolean((data as { events_cards_enabled?: boolean } | null)?.events_cards_enabled)); });
    return () => { live = false; };
  }, [topicId]);

  const save = async (next: boolean) => {
    const before = on;
    setOn(next);
    setState("saving");
    const { data, error } = await supabase.from("topic_insight_settings").update({ events_cards_enabled: next } as never).eq("topic_id", topicId).select("topic_id");
    let failed = Boolean(error);
    if (!error && (!data || data.length === 0)) {
      const { error: insertError } = await supabase.from("topic_insight_settings").insert({ topic_id: topicId, events_cards_enabled: next } as never);
      failed = Boolean(insertError);
    }
    if (failed) { setOn(before); setState("not-saved"); return; }
    setState("saved");
  };

  return (
    <SettingGroup>
      <SettingRow id="show-in-feed" label="Show in the feed">
        <SaveIndicator state={state} />
        <Switch id="events-show-in-feed" aria-label="Show in the feed" checked={on === true} disabled={on === null} onCheckedChange={(v) => void save(v)} />
      </SettingRow>
    </SettingGroup>
  );
}
