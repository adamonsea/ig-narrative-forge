import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MapPin, Calendar, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ParliamentaryBackfillTrigger } from "@/components/ParliamentaryBackfillTrigger";
import { TrackedMPsManager } from "@/components/TrackedMPsManager";

interface RegionalFeaturesSettingsProps {
  topicId: string;
  region?: string;
  parliamentaryEnabled?: boolean;
  eventsEnabled?: boolean;
  onUpdate?: () => void;
}

export const RegionalFeaturesSettings = ({
  topicId,
  region: initialRegion,
  parliamentaryEnabled: initialParliamentary,
  eventsEnabled: initialEvents,
  onUpdate
}: RegionalFeaturesSettingsProps) => {
  const [region, setRegion] = useState(initialRegion || '');
  const [parliamentaryEnabled, setParliamentaryEnabled] = useState(initialParliamentary || false);
  const [eventsEnabled, setEventsEnabled] = useState(initialEvents || false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialRegion !== undefined) setRegion(initialRegion || '');
    if (initialParliamentary !== undefined) setParliamentaryEnabled(initialParliamentary);
    if (initialEvents !== undefined) setEventsEnabled(initialEvents);
  }, [initialRegion, initialParliamentary, initialEvents]);

  const updateField = async (field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', topicId);

      if (error) throw error;
      toast({ title: "Updated" });
      onUpdate?.();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Region Input */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Region/Town
        </Label>
        <Input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          onBlur={() => updateField('region', region || null)}
          placeholder="e.g., Hastings, Brighton, Lewes"
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Used for parliamentary tracking and regional content filtering
        </p>
      </div>

      {/* Events Toggle */}
      <div className="flex items-center justify-between py-3 border-t">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Local Events
          </Label>
          <p className="text-xs text-muted-foreground">Show events between stories in feed</p>
        </div>
        <Switch
          checked={eventsEnabled}
          onCheckedChange={(checked) => {
            setEventsEnabled(checked);
            updateField('events_enabled', checked);
          }}
        />
      </div>

      {/* Parliamentary Tracking */}
      <div className="space-y-4 py-3 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Parliamentary Tracking
            </Label>
            <p className="text-xs text-muted-foreground">Track local MPs and debates</p>
          </div>
          <Switch
            checked={parliamentaryEnabled}
            onCheckedChange={(checked) => {
              setParliamentaryEnabled(checked);
              updateField('parliamentary_tracking_enabled', checked);
            }}
          />
        </div>

        {parliamentaryEnabled && region && (
          <div className="space-y-4 pl-6 border-l-2 border-muted">
            <ParliamentaryBackfillTrigger topicId={topicId} region={region} />
            <TrackedMPsManager topicId={topicId} region={region} />
          </div>
        )}
      </div>
    </div>
  );
};
