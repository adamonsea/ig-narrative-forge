import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Brain, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { TrendingKeywordsReview } from './TrendingKeywordsReview';

interface SentimentKeywordSettingsProps {
  topicId: string;
}

export const SentimentKeywordSettings = ({ topicId }: SentimentKeywordSettingsProps) => {
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
        }, { onConflict: 'topic_id' });

      if (error) throw error;
      setEnabled(checked);
      toast.success(checked ? 'Sentiment analysis enabled' : 'Sentiment analysis paused');
      
      if (checked) await triggerAnalysis();
    } catch (error) {
      console.error('Error toggling:', error);
      toast.error('Failed to update');
    }
  };

  const triggerAnalysis = async () => {
    try {
      setTriggering(true);
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: { topic_id: topicId, force_analysis: true }
      });

      if (error) throw error;
      toast.success(`Analyzed ${data?.articles_analyzed || 0} articles`);
      await loadData();
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed');
    } finally {
      setTriggering(false);
    }
  };

  const backfillHistory = async () => {
    try {
      toast.success('Backfilling history...');
      const { error } = await supabase.functions.invoke('sentiment-history-snapshot', {
        body: { backfill: true, weeksToBackfill: 8 }
      });
      if (error) throw error;
      toast.success('Historical data generated!');
    } catch (err) {
      toast.error('Backfill failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Brain className="w-6 h-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={toggleEnabled} id="sentiment-toggle" />
          <Label htmlFor="sentiment-toggle" className="cursor-pointer">
            <span className="font-medium">Sentiment Analysis</span>
            {lastRun && (
              <span className="text-xs text-muted-foreground ml-2">
                Last: {format(new Date(lastRun), 'MMM d, h:mm a')}
              </span>
            )}
          </Label>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={triggerAnalysis} disabled={triggering || !enabled} size="sm" variant="outline">
            <Sparkles className="w-4 h-4 mr-1.5" />
            {triggering ? 'Analyzing...' : 'Analyze'}
          </Button>
          <Button onClick={backfillHistory} size="sm" variant="ghost">
            <Clock className="w-4 h-4 mr-1.5" />
            Backfill
          </Button>
        </div>
      </div>

      {enabled && <TrendingKeywordsReview topicId={topicId} enabled={enabled} />}
    </div>
  );
};
