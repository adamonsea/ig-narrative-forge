import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";
import { useState, useEffect, useRef, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DripFeedSettingsProps {
  topicId: string;
  topicName?: string | undefined;
  onUpdate?: () => void;
}

interface DripFeedConfig {
  drip_feed_enabled: boolean;
  drip_release_interval_hours: number;
  drip_stories_per_release: number;
  drip_start_hour: number;
  drip_end_hour: number;
}

export const DripFeedSettings = ({ topicId, topicName, onUpdate }: DripFeedSettingsProps) => {
  const [config, setConfig] = useState<DripFeedConfig>({
    drip_feed_enabled: false,
    drip_release_interval_hours: 4,
    drip_stories_per_release: 2,
    drip_start_hour: 6,
    drip_end_hour: 22,
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const { toast } = useToast();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadConfig();
  }, [topicId]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('drip_feed_enabled, drip_release_interval_hours, drip_stories_per_release, drip_start_hour, drip_end_hour')
        .eq('id', topicId)
        .single();

      if (error) throw error;

      setConfig({
        drip_feed_enabled: data.drip_feed_enabled ?? false,
        drip_release_interval_hours: data.drip_release_interval_hours ?? 4,
        drip_stories_per_release: data.drip_stories_per_release ?? 2,
        drip_start_hour: data.drip_start_hour ?? 6,
        drip_end_hour: data.drip_end_hour ?? 22,
      });
    } catch (error) {
      console.error('Error loading drip feed config:', error);
    } finally {
      setLoading(false);
      setTimeout(() => { loadedRef.current = true; }, 100);
    }
  };


  const saveConfig = useCallback(async (updates: Partial<DripFeedConfig>) => {
    if (!loadedRef.current) return;
    setSaveState("saving");
    try {
      const { error } = await supabase
        .from('topics')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', topicId);

      if (error) throw error;
      setSaveState("saved");
      onUpdate?.();
    } catch (error) {
      console.error('Error saving drip feed settings:', error);
      setSaveState("not-saved");
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    }
  }, [topicId, toast, onUpdate]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((updates: Partial<DripFeedConfig>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveConfig(updates), 500);
  }, [saveConfig]);

  const updateConfig = (key: keyof DripFeedConfig, value: any, immediate = false) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    if (immediate) {
      saveConfig({ [key]: value });
    } else {
      debouncedSave({ [key]: value });
    }
  };

  const formatTime = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const activeHours = config.drip_end_hour - config.drip_start_hour;
  const slots = Math.floor(activeHours / config.drip_release_interval_hours);
  const totalStories = slots * config.drip_stories_per_release;

  if (loading) return <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />;

  return (
    <SettingGroup>
      <SettingRow label="Release in batches" hint={config.drip_feed_enabled ? `Up to ${totalStories} stories across ${slots} slots, ${formatTime(config.drip_start_hour)}–${formatTime(config.drip_end_hour)}.` : "Publish finished stories at set times, not all at once."}>
        <SaveIndicator state={saveState} />
        <Switch aria-label="Release in batches" checked={config.drip_feed_enabled} onCheckedChange={(checked) => updateConfig('drip_feed_enabled', checked, true)} />
      </SettingRow>
      {config.drip_feed_enabled && (
        <>
          <SettingRow label="Every" hint="Hours between releases.">
            <div className="flex w-56 items-center gap-3">
              <Slider aria-label="Release interval" value={[config.drip_release_interval_hours]} onValueChange={([v]) => updateConfig('drip_release_interval_hours', v)} min={1} max={8} step={1} />
              <span className="w-8 text-right text-base">{config.drip_release_interval_hours}h</span>
            </div>
          </SettingRow>
          <SettingRow label="Stories each time" hint="How many go live per release.">
            <div className="flex w-56 items-center gap-3">
              <Slider aria-label="Stories per release" value={[config.drip_stories_per_release]} onValueChange={([v]) => updateConfig('drip_stories_per_release', v)} min={1} max={5} step={1} />
              <span className="w-8 text-right text-base">{config.drip_stories_per_release}</span>
            </div>
          </SettingRow>
          <SettingRow label="Active hours" hint="UK time is UTC in winter, UTC+1 in summer." stack>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between text-base"><span className="text-muted-foreground">Start</span><span>{formatTime(config.drip_start_hour)}</span></div>
                <Slider aria-label="Start hour" value={[config.drip_start_hour]} onValueChange={([v]) => updateConfig('drip_start_hour', Math.min(v!, config.drip_end_hour - 1))} min={0} max={23} step={1} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-base"><span className="text-muted-foreground">End</span><span>{formatTime(config.drip_end_hour)}</span></div>
                <Slider aria-label="End hour" value={[config.drip_end_hour]} onValueChange={([v]) => updateConfig('drip_end_hour', Math.max(v!, config.drip_start_hour + 1))} min={1} max={24} step={1} />
              </div>
            </div>
          </SettingRow>
        </>
      )}
    </SettingGroup>
  );
};
