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
      console.log('🔄 Toggling sentiment analysis:', { topicId, checked });
      
      const { error } = await supabase
        .from('topic_sentiment_settings')
        .upsert({
          topic_id: topicId,
          enabled: checked,
          comparison_cards_enabled: checked,
          keyword_cards_enabled: checked,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'topic_id'
        });

      if (error) {
        console.error('❌ Upsert error:', error);
        throw error;
      }
      
      console.log('✅ Toggle successful');

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
      console.log('🎯 Starting sentiment analysis for topic:', topicId);
      
      // Pre-flight auth check
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) {
        console.error('❌ Auth check failed:', authError);
        toast.error(`Auth error: ${authError.message}`, { duration: 10000 });
        return;
      }
      
      if (!session) {
        console.error('❌ No active session');
        toast.error('Not authenticated - please sign in again', { duration: 10000 });
        return;
      }
      
      console.log('✅ Auth check passed, user:', session.user.id);
      
      // Call edge function
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: { 
          topic_id: topicId,
          force_analysis: true
        }
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        // Show full error details for mobile debugging
        const errorDetails = JSON.stringify(error, null, 2);
        toast.error(`Function error: ${errorDetails}`, { duration: 10000 });
        throw error;
      }
      
      console.log('✅ Analysis response:', data);
      
      // Show detailed success message
      const articlesCount = data?.articles_analyzed || 0;
      const keywordsCount = data?.keywords_found || 0;
      toast.success(`Analysis complete! Analyzed ${articlesCount} articles, found ${keywordsCount} keywords`, { 
        duration: 5000 
      });
      
      await loadData();
    } catch (error) {
      console.error('❌ Caught error:', error);
      
      // Display full error information for debugging
      const errorMsg = error instanceof Error 
        ? `${error.name}: ${error.message}` 
        : JSON.stringify(error);
      
      toast.error(`Failed: ${errorMsg}`, { duration: 10000 });
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
        
        {/* Backfill History Button */}
        <div className="mt-4 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                toast.success('Backfilling sentiment history...');
                const { error } = await supabase.functions.invoke('sentiment-history-snapshot', {
                  body: { backfill: true, weeksToBackfill: 8 }
                });
                if (error) throw error;
                toast.success('Historical sentiment data generated!');
              } catch (err) {
                toast.error('Failed to backfill history');
              }
            }}
            className="text-xs"
          >
            <Clock className="w-3 h-3 mr-1" />
            Generate Historical Data
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            Populate trend charts with historical keyword data
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
