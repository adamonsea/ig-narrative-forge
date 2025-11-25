import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface TopicInsightSettingsProps {
  topicId: string;
}

export const TopicInsightSettings = ({ topicId }: TopicInsightSettingsProps) => {
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['topic-insight-settings', topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topic_insight_settings')
        .select('*')
        .eq('topic_id', topicId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const { error } = await supabase
        .from('topic_insight_settings')
        .update(updates)
        .eq('topic_id', topicId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-insight-settings', topicId] });
      toast.success('Insight settings updated');
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Failed to load insight settings</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Automated Insight Cards</h3>
          <p className="text-sm text-muted-foreground">
            Control which insight card types appear in your feed
          </p>
        </div>

        <div className="space-y-4">
          {/* Story Momentum - Free Feature */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="story-momentum" className="font-medium">
                  📈 Trending Stories
                </Label>
                <Badge variant="secondary" className="text-xs">Free</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Shows most interacted-with stories in the last 24 hours
              </p>
            </div>
            <Switch
              id="story-momentum"
              checked={settings.story_momentum_enabled}
              onCheckedChange={(checked) => 
                updateSettings.mutate({ story_momentum_enabled: checked })
              }
            />
          </div>

          {/* Social Proof - Premium Feature */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="social-proof" className="font-medium">
                  👥 Community Stats
                </Label>
                <Badge variant="default" className="text-xs">Premium</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Shows reader counts, peak times, and community milestones
              </p>
            </div>
            <Switch
              id="social-proof"
              checked={settings.social_proof_enabled}
              onCheckedChange={(checked) => 
                updateSettings.mutate({ social_proof_enabled: checked })
              }
              disabled={!settings.is_premium_tier}
            />
          </div>

          {/* This Time Last Month - Premium Feature */}
          <div className="flex items-center justify-between p-4 rounded-lg border opacity-50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="flashback" className="font-medium">
                  📅 Flashback
                </Label>
                <Badge variant="default" className="text-xs">Premium</Badge>
                <Badge variant="outline" className="text-xs">Coming Soon</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Shows what stories were popular 30 days ago
              </p>
            </div>
            <Switch
              id="flashback"
              checked={settings.this_time_last_month_enabled}
              disabled={true}
            />
          </div>
        </div>

        {!settings.is_premium_tier && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              <strong>Upgrade to Premium</strong> to unlock Community Stats and Flashback cards.
              These advanced insight types help build reader engagement and community.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
