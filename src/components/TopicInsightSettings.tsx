import { CopyLink } from "@/components/settings/SettingRow";
import { SettingLoadError } from '@/components/settings/SettingRow';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { FEATURES } from "@/lib/featureFlags";

interface TopicInsightSettingsProps {
  topicId: string;
}

export const TopicInsightSettings = ({ topicId }: TopicInsightSettingsProps) => {
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settings, isLoading, refetch } = useQuery({
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
        .update(updates as any)
        .eq('topic_id', topicId);

      if (error) throw error;
      
      // If social proof was just enabled, trigger immediate generation
      if (updates['social_proof_enabled'] === true) {
        await supabase.functions.invoke('generate-social-proof-cards', {
          body: { topicId }
        });
      }
      
      // If story momentum was just enabled, trigger immediate generation
      if (updates['story_momentum_enabled'] === true) {
        await supabase.functions.invoke('generate-story-momentum-cards', {
          body: { topicId }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-insight-settings', topicId] });
      toast.success('Insight settings updated');
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  // Regenerate mutation
  const regenerateCard = useMutation({
    mutationFn: async (cardType: 'story_momentum' | 'social_proof') => {
      const functionName = cardType === 'story_momentum' 
        ? 'generate-story-momentum-cards' 
        : 'generate-social-proof-cards';
      
      const { error } = await supabase.functions.invoke(functionName, {
        body: { 
          topicId,
          forceRegenerate: true
        }
      });

      if (error) throw error;
    },
    onSuccess: (_, cardType) => {
      toast.success(`${cardType === 'story_momentum' ? 'Story momentum' : 'Social proof'} card regenerated!`);
    },
    onError: (error) => {
      toast.error(`Failed to regenerate: ${error.message}`);
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
      <SettingLoadError what="Feed cards" onRetry={() => void refetch()} />
    );
  }

  return (
    <div>
      <div className="space-y-6">

        <div className="divide-y divide-border border-y border-border">
          {/* Story Momentum - Free Feature */}
          <div id="trending" data-setting-row className="group/row flex scroll-mt-24 items-center justify-between gap-6 py-5">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="story-momentum" className="text-base font-medium">
                  Trending
                </Label><CopyLink anchor="trending" />
                
              </div>
              <p className="text-sm text-muted-foreground">Shows most interacted-with stories in the last 24 hours</p>
            </div>
            <div className="flex items-center gap-2">
              {settings.story_momentum_enabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => regenerateCard.mutate('story_momentum')}
                  aria-label="Refresh trending card"
                  title="Refresh"
                  disabled={regenerateCard.isPending}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              <Switch
                id="story-momentum"
                checked={settings.story_momentum_enabled!}
                onCheckedChange={(checked) => 
                  updateSettings.mutate({ story_momentum_enabled: checked })
                }
              />
            </div>
          </div>

          {/* Social Proof - Premium Feature */}
          <div className="flex items-center justify-between gap-6 py-5">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="social-proof" className="text-base font-medium">
                  Community stats
                </Label>
                
                <Badge variant="default" className="text-sm">Premium</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Shows reader counts, peak times, and community milestones</p>
            </div>
            <div className="flex items-center gap-2">
              {settings.social_proof_enabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => regenerateCard.mutate('social_proof')}
                  aria-label="Refresh community stats card"
                  title="Refresh"
                  disabled={regenerateCard.isPending || !settings.is_premium_tier}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              <Switch
                id="social-proof"
                checked={settings.social_proof_enabled!}
                onCheckedChange={(checked) => 
                  updateSettings.mutate({ social_proof_enabled: checked })
                }
                disabled={!settings.is_premium_tier}
              />
            </div>
          </div>

          {/* Play Mode - Premium Feature */}
          <div className="flex items-center justify-between gap-6 py-5">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="play-mode" className="text-base font-medium">
                  Play mode
                </Label>
                
                <Badge variant="default" className="text-sm">Premium</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Swipe-based interface to discover stories across all feeds</p>
            </div>
            <Switch
              id="play-mode"
              checked={settings.play_mode_enabled!}
              onCheckedChange={(checked) => 
                updateSettings.mutate({ play_mode_enabled: checked })
              }
              disabled={!settings.is_premium_tier}
            />
          </div>

          {/* Quiz Cards - Premium Feature */}
          <div className="py-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="quiz-cards" className="text-base font-medium">
                    Quiz cards
                  </Label>
                
                  <Badge variant="default" className="text-sm">Premium</Badge>
                </div>
              <p className="text-sm text-muted-foreground">AI-generated quiz questions based on your feed content</p>
              </div>
              <Switch
                id="quiz-cards"
                checked={settings.quiz_cards_enabled!}
                onCheckedChange={(checked) => 
                  updateSettings.mutate({ quiz_cards_enabled: checked })
                }
                disabled={!settings.is_premium_tier}
              />
            </div>
            
            {settings.quiz_cards_enabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('quiz_answered');
                  toast.success('Quiz history cleared. Refresh to see all quiz cards.');
                }}
                className=""
              >
                Clear quiz history
              </Button>
            )}
          </div>

          {/* This Time Last Month - Premium Feature */}
          <div className="flex items-center justify-between gap-6 py-5">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="flashback" className="text-base font-medium">
                  Flashback
                </Label>
                
                <Badge variant="default" className="text-sm">Premium</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Shows what stories were popular 30 days ago</p>
            </div>
            <Switch
              id="flashback"
              checked={settings.this_time_last_month_enabled!}
              onCheckedChange={(checked) => 
                updateSettings.mutate({ this_time_last_month_enabled: checked })
              }
              disabled={!settings.is_premium_tier}
            />
          </div>

          {/* Feed-only switches: data collection and the weekly email are unaffected */}
          {FEATURES.parliament && ([
            ['parliamentary_cards_enabled', 'Parliament cards', 'MP vote cards and the weekly parliament digest in your public feed'],
          ] as const).map(([key, label, desc]) => (
            <div key={key} className="flex items-center justify-between gap-6 py-5">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2"><Label htmlFor={key} className="text-base font-medium">{label}</Label></div>
              </div>
              <p className="text-sm text-muted-foreground">{desc}</p>
              <Switch
                id={key}
                checked={!!(settings as any)[key]}
                onCheckedChange={(checked) => updateSettings.mutate({ [key]: checked })}
              />
            </div>
          ))}

          {/* Sift Mode - Premium Feature */}
          <div className="flex items-center justify-between gap-6 py-5">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="sift-mode" className="text-base font-medium">
                  Sift mode
                </Label>
                
                <Badge variant="default" className="text-sm">Premium</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Photo pile interface for browsing stories visually</p>
            </div>
            <Switch
              id="sift-mode"
              checked={settings.sift_enabled!}
              onCheckedChange={(checked) => 
                updateSettings.mutate({ sift_enabled: checked })
              }
              disabled={!settings.is_premium_tier}
            />
          </div>
        </div>

        {!settings.is_premium_tier && (
          <p className="text-sm text-muted-foreground">Premium cards need Pro.</p>
        )}
      </div>
    </div>
  );
};
