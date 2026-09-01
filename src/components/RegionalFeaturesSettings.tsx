import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Building2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ParliamentaryBackfillTrigger } from "@/components/ParliamentaryBackfillTrigger";
import { TrackedMPsManager } from "@/components/TrackedMPsManager";

interface RegionalFeaturesSettingsProps {
  topicId: string;
  region?: string;
  parliamentaryEnabled?: boolean;
  eventsEnabled?: boolean;
  eventSourceUrl?: string | null;
  onUpdate?: () => void;
}

export const RegionalFeaturesSettings = ({
  topicId,
  region: initialRegion,
  parliamentaryEnabled: initialParliamentary,
  eventsEnabled: initialEvents,
  eventSourceUrl: initialEventSourceUrl,
  onUpdate
}: RegionalFeaturesSettingsProps) => {
  const [region, setRegion] = useState(initialRegion || '');
  const [parliamentaryEnabled, setParliamentaryEnabled] = useState(initialParliamentary || false);
  const [eventsEnabled, setEventsEnabled] = useState(initialEvents || false);
  const [eventSourceUrl, setEventSourceUrl] = useState(initialEventSourceUrl || '');
  const [refreshingEvents, setRefreshingEvents] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialRegion !== undefined) setRegion(initialRegion || '');
    if (initialParliamentary !== undefined) setParliamentaryEnabled(initialParliamentary);
    if (initialEvents !== undefined) setEventsEnabled(initialEvents);
    if (initialEventSourceUrl !== undefined) setEventSourceUrl(initialEventSourceUrl || '');
  }, [initialRegion, initialParliamentary, initialEvents, initialEventSourceUrl]);

  const refreshEvents = async () => {
    setRefreshingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke('ingest-chamber-events', {
        body: { topicId }
      });
      if (error) throw error;
      const imported = data?.results?.[0]?.imported ?? 0;
      const failure = data?.results?.[0]?.error;
      if (failure) throw new Error(failure);
      toast({ title: "Events refreshed", description: `${imported} upcoming events imported` });
      onUpdate?.();
    } catch (error) {
      toast({
        title: "Couldn't refresh events",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    } finally {
      setRefreshingEvents(false);
    }
  };


  const updateField = async (field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ [field]: value, updated_at: new Date().toISOString() } as any)
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

      {/* Events */}
      <div className="space-y-4 py-3 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Local Events
            </Label>
            <p className="text-xs text-muted-foreground">
              Show events between stories in the feed, and in the weekly email
            </p>
          </div>
          <Switch
            checked={eventsEnabled}
            onCheckedChange={(checked) => {
              setEventsEnabled(checked);
              updateField('events_enabled', checked);
            }}
          />
        </div>

        {eventsEnabled && (
          <div className="space-y-2 pl-6 border-l-2 border-muted">
            <Label htmlFor="event-source-url" className="text-sm">Events calendar feed</Label>
            <div className="flex gap-2 max-w-xl">
              <Input
                id="event-source-url"
                value={eventSourceUrl}
                onChange={(e) => setEventSourceUrl(e.target.value)}
                onBlur={() => updateField('event_source_url', eventSourceUrl.trim() || null)}
                placeholder="https://members.example.co.uk/ajax_website/ajax_retrieveevents.php"
              />
              <Button
                variant="outline"
                onClick={refreshEvents}
                disabled={refreshingEvents || !eventSourceUrl.trim()}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshingEvents ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Events are imported daily. Upcoming events appear in the weekly email only when there are any.
            </p>
          </div>
        )}
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
