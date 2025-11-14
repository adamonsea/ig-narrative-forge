import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Brain, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { TrendingKeywordsReview } from './TrendingKeywordsReview';

interface SentimentHubProps {
  topicId: string;
}

export const SentimentHub = ({ topicId }: SentimentHubProps) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: settings } = await supabase
        .from('topic_sentiment_settings')
        .select('*')
        .eq('topic_id', topicId)
        .single();

      if (settings) {
        setEnabled(settings.enabled || false);
        setLastRun(settings.last_analysis_at);
      }
    } catch (error) {
      console.error('Error loading sentiment data:', error);
      toast.error('Failed to load sentiment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const settingsChannel = supabase
      .channel(`sentiment-settings-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_sentiment_settings',
          filter: `topic_id=eq.${topicId}`
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
    };
  }, [topicId]);

  const toggleEnabled = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from('topic_sentiment_settings')
        .upsert({
          topic_id: topicId,
          enabled: checked,
          comparison_cards_enabled: checked,
          keyword_cards_enabled: checked,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setEnabled(checked);
      toast.success(checked ? 'Sentiment analysis enabled' : 'Sentiment analysis paused');
      
      if (checked) {
        await triggerAnalysis();
      }
    } catch (error) {
      console.error('Error toggling sentiment analysis:', error);
      toast.error('Failed to update settings');
    }
  };

  const triggerAnalysis = async () => {
    try {
      setTriggering(true);
      const { error } = await supabase.functions.invoke('sentiment-detector', {
        body: { 
          topic_id: topicId,
          force_analysis: true
        }
      });

      if (error) throw error;

      toast.success('Analysis triggered successfully');
      await loadData();
    } catch (error) {
      console.error('Error triggering analysis:', error);
      toast.error('Failed to trigger analysis');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <Brain className="w-8 h-8 animate-pulse mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Trending Keywords
            </CardTitle>
            <CardDescription>
              Review and publish sentiment insights
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {lastRun && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Last analyzed</p>
                <p className="text-xs font-medium">{format(new Date(lastRun), 'MMM d, h:mm a')}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={toggleEnabled}
                id="sentiment-enabled"
              />
              <Label htmlFor="sentiment-enabled" className="text-sm cursor-pointer">
                {enabled ? 'On' : 'Off'}
              </Label>
            </div>
            <Button 
              onClick={triggerAnalysis}
              disabled={triggering || !enabled}
              size="sm"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TrendingKeywordsReview topicId={topicId} enabled={enabled} />
      </CardContent>
    </Card>
  );
};
