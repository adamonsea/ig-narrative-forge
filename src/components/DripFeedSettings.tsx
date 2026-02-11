import { useState, useEffect, useRef, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DripFeedSettingsProps {
  topicId: string;
  topicName?: string;
  onUpdate?: () => void;
}

interface DripFeedConfig {
  drip_feed_enabled: boolean;
  drip_release_interval_hours: number;
  drip_stories_per_release: number;
  drip_start_hour: number;
  drip_end_hour: number;
}

interface QueuedStory {
  id: string;
  title: string;
  scheduled_publish_at: string;
}

export const DripFeedSettings = ({ topicId, topicName, onUpdate }: DripFeedSettingsProps) => {
  const [config, setConfig] = useState<DripFeedConfig>({
    drip_feed_enabled: false,
    drip_release_interval_hours: 4,
    drip_stories_per_release: 2,
    drip_start_hour: 6,
    drip_end_hour: 22,
  });
  const [queuedStories, setQueuedStories] = useState<QueuedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emergencyPublishing, setEmergencyPublishing] = useState(false);
  const { toast } = useToast();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadConfig();
    loadQueuedStories();

    const channel = supabase
      .channel('drip-feed-stories')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stories' }, (payload) => {
        if (payload.new && (payload.new as any).status === 'published') {
          loadQueuedStories();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

  const loadQueuedStories = async () => {
    try {
      const { data: stories, error } = await supabase
        .from('stories')
        .select('id, title, scheduled_publish_at, topic_article_id')
        .eq('status', 'ready')
        .not('scheduled_publish_at', 'is', null)
        .gt('scheduled_publish_at', new Date().toISOString())
        .order('scheduled_publish_at', { ascending: true });

      if (error) throw error;

      const topicStories: QueuedStory[] = [];
      for (const story of stories || []) {
        if (story.topic_article_id) {
          const { data: ta } = await supabase
            .from('topic_articles')
            .select('topic_id')
            .eq('id', story.topic_article_id)
            .single();
          if (ta?.topic_id === topicId) {
            topicStories.push({
              id: story.id,
              title: story.title || 'Untitled',
              scheduled_publish_at: story.scheduled_publish_at!,
            });
          }
        }
      }
      setQueuedStories(topicStories);
    } catch (error) {
      console.error('Error loading queued stories:', error);
    }
  };

  const saveConfig = useCallback(async (updates: Partial<DripFeedConfig>) => {
    if (!loadedRef.current) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', topicId);

      if (error) throw error;
      toast({ title: 'Saved' });
      onUpdate?.();
    } catch (error) {
      console.error('Error saving drip feed settings:', error);
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
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

  const handleEmergencyPublish = async () => {
    if (!confirm('Immediately publish all queued stories?')) return;
    setEmergencyPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('drip-feed-scheduler', {
        body: { topic_id: topicId, emergency_publish_all: true },
      });
      if (error) throw error;
      toast({ title: 'Published', description: `Released ${data.stories_released || 0} stories` });
      loadQueuedStories();
      onUpdate?.();
    } catch (error) {
      console.error('Error in emergency publish:', error);
      toast({ title: 'Error', description: 'Failed to publish', variant: 'destructive' });
    } finally {
      setEmergencyPublishing(false);
    }
  };

  const formatTime = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  };

  const activeHours = config.drip_end_hour - config.drip_start_hour;
  const slots = Math.floor(activeHours / config.drip_release_interval_hours);
  const totalStories = slots * config.drip_stories_per_release;

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Drip Feed</Label>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <Switch
            checked={config.drip_feed_enabled}
            onCheckedChange={(checked) => updateConfig('drip_feed_enabled', checked, true)}
          />
        </div>
      </div>

      {config.drip_feed_enabled && (
        <div className="space-y-4 pl-0">
          {/* Interval */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Release interval</Label>
              <span className="text-xs text-muted-foreground">{config.drip_release_interval_hours}h</span>
            </div>
            <Slider
              value={[config.drip_release_interval_hours]}
              onValueChange={([v]) => updateConfig('drip_release_interval_hours', v)}
              min={1} max={8} step={1}
            />
          </div>

          {/* Stories per release */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Stories per release</Label>
              <span className="text-xs text-muted-foreground">{config.drip_stories_per_release}</span>
            </div>
            <Slider
              value={[config.drip_stories_per_release]}
              onValueChange={([v]) => updateConfig('drip_stories_per_release', v)}
              min={1} max={5} step={1}
            />
          </div>

          {/* Active hours */}
          <div className="space-y-2">
            <Label className="text-sm">Active hours (UTC)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Start</span>
                <Slider
                  value={[config.drip_start_hour]}
                  onValueChange={([v]) => updateConfig('drip_start_hour', Math.min(v, config.drip_end_hour - 1))}
                  min={0} max={23} step={1}
                />
                <div className="text-center text-xs font-medium">{formatTime(config.drip_start_hour)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">End</span>
                <Slider
                  value={[config.drip_end_hour]}
                  onValueChange={([v]) => updateConfig('drip_end_hour', Math.max(v, config.drip_start_hour + 1))}
                  min={1} max={24} step={1}
                />
                <div className="text-center text-xs font-medium">{formatTime(config.drip_end_hour)}</div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <p className="text-xs text-muted-foreground">
            Up to {totalStories} stories across {slots} slots, {formatTime(config.drip_start_hour)}–{formatTime(config.drip_end_hour)}
          </p>

          {/* Queued */}
          {queuedStories.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                Queued <Badge variant="secondary" className="h-4 text-[10px]">{queuedStories.length}</Badge>
              </Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {queuedStories.map((story) => (
                  <div key={story.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="truncate">{story.title}</span>
                    <span className="text-[10px] shrink-0">{formatScheduledTime(story.scheduled_publish_at)}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEmergencyPublish}
                disabled={emergencyPublishing}
                className="w-full h-7 text-xs"
              >
                {emergencyPublishing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                {emergencyPublishing ? 'Publishing...' : `Publish All ${queuedStories.length} Now`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
