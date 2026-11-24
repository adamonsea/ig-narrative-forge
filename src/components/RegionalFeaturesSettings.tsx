import { SettingRow } from "@/components/settings/SettingRow";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ParliamentaryBackfillTrigger } from "@/components/ParliamentaryBackfillTrigger";
import { TrackedMPsManager } from "@/components/TrackedMPsManager";
import { FEATURES } from "@/lib/featureFlags";


interface RegionalFeaturesSettingsProps {
  topicId: string;
  region?: string | undefined;
  parliamentaryEnabled?: boolean | undefined;
  onUpdate?: () => void;
}

// Events (switch, Show in the feed) live on the Desk; events sources live in the one Sources list.
export const RegionalFeaturesSettings = ({
  topicId,
  region: initialRegion,
  parliamentaryEnabled: initialParliamentary,
  onUpdate
}: RegionalFeaturesSettingsProps) => {
  const [region, setRegion] = useState(initialRegion || '');
  const [parliamentaryEnabled, setParliamentaryEnabled] = useState(initialParliamentary || false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialRegion !== undefined) setRegion(initialRegion || '');
    if (initialParliamentary !== undefined) setParliamentaryEnabled(initialParliamentary);
  }, [initialRegion, initialParliamentary]);

  const [state, setState] = useState<SaveState>(null);
  const updateField = async (field: string, value: any) => {
    setState("saving");
    const { error } = await supabase
      .from('topics')
      .update({ [field]: value, updated_at: new Date().toISOString() } as any)
      .eq('id', topicId);
    if (error) {
      setState("not-saved");
      toast({ title: "Not saved", description: "Please try again.", variant: "destructive" });
      return;
    }
    setState("saved");
    onUpdate?.();
  };

  return (
    <div className="divide-y divide-border border-y border-border">
      <SettingRow label="Town" hint="The place this feed reports on.">
        <SaveIndicator state={state} />
        <Input aria-label="Town" value={region} onChange={(e) => setRegion(e.target.value)} onBlur={() => updateField('region', region || null)} placeholder="e.g. Hastings" className="h-11 w-56 text-base" />
      </SettingRow>
      {/* Parliamentary Tracking — parked (docs/parked-features.md); the saved setting is kept */}
      {FEATURES.parliament && (
        <SettingRow label="Parliament" hint="Local MPs' votes and debates.">
          <Switch aria-label="Parliament" checked={parliamentaryEnabled} onCheckedChange={(checked) => { setParliamentaryEnabled(checked); updateField('parliamentary_tracking_enabled', checked); }} />
        </SettingRow>
      )}
      {FEATURES.parliament && parliamentaryEnabled && region && (
        <div className="space-y-4 py-5">
          <ParliamentaryBackfillTrigger topicId={topicId} region={region} />
          <TrackedMPsManager topicId={topicId} region={region} />
        </div>
      )}
    </div>
  );
};
