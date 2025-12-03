import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Droplets, AlertTriangle, HelpCircle, Zap, Calendar } from "lucide-react";
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
  const [originalConfig, setOriginalConfig] = useState<DripFeedConfig | null>(null);
  const [queuedStories, setQueuedStories] = useState<QueuedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emergencyPublishing, setEmergencyPublishing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
    loadQueuedStories();
  }, [topicId]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('drip_feed_enabled, drip_release_interval_hours, drip_stories_per_release, drip_start_hour, drip_end_hour')
        .eq('id', topicId)
        .single();

      if (error) throw error;

      const loadedConfig: DripFeedConfig = {
        drip_feed_enabled: data.drip_feed_enabled ?? false,
        drip_release_interval_hours: data.drip_release_interval_hours ?? 4,
        drip_stories_per_release: data.drip_stories_per_release ?? 2,
        drip_start_hour: data.drip_start_hour ?? 6,
        drip_end_hour: data.drip_end_hour ?? 22,
      };

      setConfig(loadedConfig);
      setOriginalConfig(loadedConfig);
    } catch (error) {
      console.error('Error loading drip feed config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQueuedStories = async () => {
    try {
      // Get stories with scheduled_publish_at in the future
      const { data: stories, error } = await supabase
        .from('stories')
        .select('id, title, scheduled_publish_at, topic_article_id')
        .eq('status', 'ready')
        .not('scheduled_publish_at', 'is', null)
        .gt('scheduled_publish_at', new Date().toISOString())
        .order('scheduled_publish_at', { ascending: true });

      if (error) throw error;

      // Filter to only this topic's stories
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
              scheduled_publish_at: story.scheduled_publish_at!
            });
          }
        }
      }

      setQueuedStories(topicStories);
    } catch (error) {
      console.error('Error loading queued stories:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          drip_feed_enabled: config.drip_feed_enabled,
          drip_release_interval_hours: config.drip_release_interval_hours,
          drip_stories_per_release: config.drip_stories_per_release,
          drip_start_hour: config.drip_start_hour,
          drip_end_hour: config.drip_end_hour,
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;

      setOriginalConfig(config);
      toast({
        title: "Drip Feed Settings Saved",
        description: config.drip_feed_enabled 
          ? "Stories will be released gradually throughout the day" 
          : "Stories will publish immediately when ready"
      });
      
      onUpdate?.();
    } catch (error) {
      console.error('Error saving drip feed settings:', error);
      toast({
        title: "Error",
        description: "Failed to save drip feed settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyPublish = async () => {
    if (!confirm('This will immediately publish all queued stories. Are you sure?')) {
      return;
    }

    setEmergencyPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('drip-feed-scheduler', {
        body: { 
          topic_id: topicId,
          emergency_publish_all: true 
        }
      });

      if (error) throw error;

      toast({
        title: "Emergency Publish Complete",
        description: `Released ${data.stories_released || 0} stories for immediate publishing`
      });

      // Refresh the queue
      loadQueuedStories();
      onUpdate?.();
    } catch (error) {
      console.error('Error in emergency publish:', error);
      toast({
        title: "Error",
        description: "Failed to emergency publish stories",
        variant: "destructive"
      });
    } finally {
      setEmergencyPublishing(false);
    }
  };

  const hasChanges = originalConfig && (
    config.drip_feed_enabled !== originalConfig.drip_feed_enabled ||
    config.drip_release_interval_hours !== originalConfig.drip_release_interval_hours ||
    config.drip_stories_per_release !== originalConfig.drip_stories_per_release ||
    config.drip_start_hour !== originalConfig.drip_start_hour ||
    config.drip_end_hour !== originalConfig.drip_end_hour
  );

  const formatTime = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const formatScheduledTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    });
  };

  // Calculate daily release preview
  const calculateDailySlots = () => {
    const { drip_start_hour, drip_end_hour, drip_release_interval_hours, drip_stories_per_release } = config;
    const activeHours = drip_end_hour - drip_start_hour;
    const slots = Math.floor(activeHours / drip_release_interval_hours);
    const totalStories = slots * drip_stories_per_release;
    return { slots, totalStories };
  };

  const { slots, totalStories } = calculateDailySlots();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading drip feed settings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="w-5 h-5" />
          Drip Feed Release
          <Badge variant={config.drip_feed_enabled ? "default" : "secondary"} className="ml-2">
            {config.drip_feed_enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Enable Drip Feed
            </Label>
            <p className="text-sm text-muted-foreground">
              Release stories gradually throughout the day instead of all at once
            </p>
          </div>
          <Switch
            checked={config.drip_feed_enabled}
            onCheckedChange={(checked) => setConfig({ ...config, drip_feed_enabled: checked })}
          />
        </div>

        {config.drip_feed_enabled && (
          <>
            {/* Release Interval */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  Release Interval
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Hours between each batch of story releases</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Badge variant="outline">{config.drip_release_interval_hours} hours</Badge>
              </div>
              <Slider
                value={[config.drip_release_interval_hours]}
                onValueChange={([value]) => setConfig({ ...config, drip_release_interval_hours: value })}
                min={1}
                max={8}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 hour</span>
                <span>8 hours</span>
              </div>
            </div>

            {/* Stories Per Release */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  Stories Per Release
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Number of stories to publish in each release batch</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Badge variant="outline">{config.drip_stories_per_release} stories</Badge>
              </div>
              <Slider
                value={[config.drip_stories_per_release]}
                onValueChange={([value]) => setConfig({ ...config, drip_stories_per_release: value })}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 story</span>
                <span>5 stories</span>
              </div>
            </div>

            {/* Active Hours */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Active Release Hours (UTC)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Start</span>
                  <Slider
                    value={[config.drip_start_hour]}
                    onValueChange={([value]) => setConfig({ ...config, drip_start_hour: Math.min(value, config.drip_end_hour - 1) })}
                    min={0}
                    max={23}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-center font-medium">{formatTime(config.drip_start_hour)}</div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">End</span>
                  <Slider
                    value={[config.drip_end_hour]}
                    onValueChange={([value]) => setConfig({ ...config, drip_end_hour: Math.max(value, config.drip_start_hour + 1) })}
                    min={1}
                    max={24}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-center font-medium">{formatTime(config.drip_end_hour)}</div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">Daily Release Preview</div>
              <div className="text-sm text-muted-foreground">
                Up to <span className="font-semibold text-foreground">{totalStories} stories</span> across{" "}
                <span className="font-semibold text-foreground">{slots} release slots</span> between{" "}
                {formatTime(config.drip_start_hour)} and {formatTime(config.drip_end_hour)}
              </div>
            </div>

            {/* Queued Stories */}
            {queuedStories.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Queued for Release
                    <Badge variant="secondary">{queuedStories.length}</Badge>
                  </Label>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {queuedStories.map((story) => (
                    <div key={story.id} className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-2">
                      <span className="truncate max-w-[200px]">{story.title}</span>
                      <Badge variant="outline" className="shrink-0 ml-2">
                        {formatScheduledTime(story.scheduled_publish_at)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Bypass */}
            {queuedStories.length > 0 && (
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleEmergencyPublish}
                  disabled={emergencyPublishing}
                  className="w-full"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {emergencyPublishing ? "Publishing..." : `Emergency: Publish All ${queuedStories.length} Now`}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Bypasses drip feed and publishes all queued stories immediately
                </p>
              </div>
            )}
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Save Drip Feed Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
