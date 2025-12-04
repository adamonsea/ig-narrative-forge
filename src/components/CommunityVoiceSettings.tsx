import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Users, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CommunityVoiceSettingsProps {
  topicId: string;
  enabled?: boolean;
  pulseFrequency?: number;
  config?: {
    subreddits?: string[];
    processing_frequency_hours?: number;
    last_processed?: string;
  };
  topicType?: string;
  region?: string;
  onUpdate?: () => void;
}

export const CommunityVoiceSettings = ({
  topicId,
  enabled: initialEnabled,
  pulseFrequency: initialPulseFrequency,
  config,
  topicType,
  region,
  onUpdate
}: CommunityVoiceSettingsProps) => {
  const [enabled, setEnabled] = useState(initialEnabled || false);
  const [subreddits, setSubreddits] = useState<string[]>(config?.subreddits || []);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [processingFrequency, setProcessingFrequency] = useState(config?.processing_frequency_hours || 24);
  const [pulseFrequency, setPulseFrequency] = useState(initialPulseFrequency || 8);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialEnabled !== undefined) setEnabled(initialEnabled);
    if (config?.subreddits) setSubreddits(config.subreddits);
    if (config?.processing_frequency_hours) setProcessingFrequency(config.processing_frequency_hours);
    if (initialPulseFrequency) setPulseFrequency(initialPulseFrequency);
  }, [initialEnabled, config, initialPulseFrequency]);

  const nationalSubreddits = ['unitedkingdom', 'uk', 'ukpolitics', 'england', 'britishproblems', 'casualuk', 'scotland', 'wales', 'northernireland', 'london'];

  const toggleEnabled = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          community_intelligence_enabled: checked,
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;
      setEnabled(checked);
      toast({ title: checked ? "Community Voice enabled" : "Community Voice disabled" });
      onUpdate?.();
    } catch (error) {
      console.error('Error toggling:', error);
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const addSubreddit = async () => {
    const cleaned = newSubreddit.trim().toLowerCase().replace(/^r\//, '');
    if (!cleaned || subreddits.includes(cleaned)) return;

    if (nationalSubreddits.includes(cleaned) && topicType === 'regional') {
      toast({
        title: "⚠️ National subreddit",
        description: `r/${cleaned} may give generic insights. Consider local subreddits.`
      });
    }

    const updated = [...subreddits, cleaned];
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          community_config: { subreddits: updated, processing_frequency_hours: processingFrequency, last_processed: config?.last_processed },
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;
      setSubreddits(updated);
      setNewSubreddit('');
      onUpdate?.();
    } catch (error) {
      toast({ title: "Error", description: "Failed to add", variant: "destructive" });
    }
  };

  const removeSubreddit = async (sub: string) => {
    const updated = subreddits.filter(s => s !== sub);
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          community_config: { subreddits: updated, processing_frequency_hours: processingFrequency, last_processed: config?.last_processed },
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;
      setSubreddits(updated);
      toast({ title: "Removed", description: `r/${sub} removed` });
      onUpdate?.();
    } catch (error) {
      setSubreddits(subreddits);
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const processNow = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('reddit-community-scheduler', {
        body: { manual_test: true, force_topic_id: topicId }
      });
      if (error) throw error;
      toast({ title: "Processing started", description: "Check back in a few minutes" });
    } catch (error) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Community Voice
          </Label>
          <p className="text-xs text-muted-foreground">
            {enabled ? "Monitoring Reddit discussions" : "Add community insights to your feed"}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-2">
            <Label className="text-xs">Subreddits to Monitor</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. eastbourne"
                value={newSubreddit}
                onChange={(e) => setNewSubreddit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubreddit())}
                className="h-9"
              />
              <Button onClick={addSubreddit} disabled={!newSubreddit.trim()} size="sm" variant="secondary">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {subreddits.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {subreddits.map((sub) => (
                  <Badge key={sub} variant={nationalSubreddits.includes(sub) && topicType === 'regional' ? "destructive" : "secondary"} className="gap-1 text-xs">
                    {nationalSubreddits.includes(sub) && topicType === 'regional' && "⚠️ "}
                    r/{sub}
                    <button onClick={() => removeSubreddit(sub)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Processing Frequency</Label>
              <Select value={processingFrequency.toString()} onValueChange={(v) => setProcessingFrequency(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours</SelectItem>
                  <SelectItem value="48">Every 48 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Show pulse every {pulseFrequency} stories</Label>
              <Slider
                value={[pulseFrequency]}
                onValueChange={([v]) => setPulseFrequency(v)}
                max={20}
                min={4}
                step={2}
              />
            </div>
          </div>

          <Button onClick={processNow} disabled={processing} variant="outline" size="sm" className="w-full sm:w-auto">
            <Users className="w-4 h-4 mr-2" />
            {processing ? 'Processing...' : 'Process Now'}
          </Button>
        </div>
      )}
    </div>
  );
};
