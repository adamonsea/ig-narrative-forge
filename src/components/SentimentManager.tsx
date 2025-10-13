import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Pin, TrendingDown, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TrendingKeyword {
  keyword_phrase: string;
  total_mentions: number;
  source_count: number;
  current_trend: 'emerging' | 'sustained' | 'fading';
  tracked_for_cards: boolean;
}

interface SentimentManagerProps {
  topicId: string;
}

export const SentimentManager = ({ topicId }: SentimentManagerProps) => {
  const [enabled, setEnabled] = useState(true);
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [topicId]);

  const loadData = async () => {
    try {
      // Load sentiment settings
      const { data: settings } = await supabase
        .from('topic_sentiment_settings')
        .select('enabled, excluded_keywords')
        .eq('topic_id', topicId)
        .single();

      if (settings) {
        setEnabled(settings.enabled);
        setExcludedKeywords(settings.excluded_keywords || []);
      }

      // Load trending keywords
      const { data: keywords } = await supabase
        .from('sentiment_keyword_tracking')
        .select('keyword_phrase, total_mentions, source_count, current_trend, tracked_for_cards')
        .eq('topic_id', topicId)
        .in('current_trend', ['emerging', 'sustained', 'fading'])
        .order('total_mentions', { ascending: false });

      setTrendingKeywords((keywords || []).map(k => ({
        ...k,
        current_trend: k.current_trend as 'emerging' | 'sustained' | 'fading'
      })));
    } catch (error) {
      console.error('Error loading sentiment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from('topic_sentiment_settings')
        .upsert({
          topic_id: topicId,
          enabled: checked,
          excluded_keywords: excludedKeywords
        });

      if (error) throw error;
      setEnabled(checked);
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      });
    }
  };

  const triggerAnalysis = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: { topic_id: topicId, force_analysis: true }
      });

      if (error) throw error;

      toast({
        title: "Analysis Complete",
        description: `Found ${data?.keywords_identified || 0} trending keywords`
      });

      setTimeout(loadData, 2000);
    } catch (error) {
      console.error('Error triggering analysis:', error);
      toast({
        title: "Error",
        description: "Failed to trigger analysis",
        variant: "destructive"
      });
    }
  };

  const toggleTracking = async (keywordPhrase: string, currentlyTracked: boolean) => {
    try {
      const { error } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ 
          tracked_for_cards: !currentlyTracked,
          next_card_due_at: !currentlyTracked ? new Date().toISOString() : null
        })
        .eq('topic_id', topicId)
        .eq('keyword_phrase', keywordPhrase);

      if (error) throw error;

      setTrendingKeywords(prev => 
        prev.map(kw => 
          kw.keyword_phrase === keywordPhrase 
            ? { ...kw, tracked_for_cards: !currentlyTracked }
            : kw
        )
      );

      toast({
        title: !currentlyTracked ? "Tracking Enabled" : "Tracking Disabled",
        description: !currentlyTracked 
          ? `"${keywordPhrase}" will auto-generate cards weekly`
          : `Stopped tracking "${keywordPhrase}"`
      });
    } catch (error) {
      console.error('Error toggling tracking:', error);
      toast({
        title: "Error",
        description: "Failed to update tracking",
        variant: "destructive"
      });
    }
  };

  const removeExcluded = async (keyword: string) => {
    try {
      const updated = excludedKeywords.filter(k => k !== keyword);
      const { error } = await supabase
        .from('topic_sentiment_settings')
        .update({ excluded_keywords: updated })
        .eq('topic_id', topicId);

      if (error) throw error;
      setExcludedKeywords(updated);
    } catch (error) {
      console.error('Error removing keyword:', error);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const trackedCount = trendingKeywords.filter(k => k.tracked_for_cards).length;

  return (
    <div className="space-y-3">
      {/* Compact toggle + action row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
          <Label className="text-sm font-normal cursor-pointer" onClick={() => toggleEnabled(!enabled)}>
            Enabled
          </Label>
        </div>
        <Button onClick={triggerAnalysis} size="sm" variant="outline">
          <Sparkles className="h-4 w-4 mr-1" />
          Analyze
        </Button>
      </div>

      {/* Auto-discovered trending keywords */}
      {trendingKeywords.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm">Trending Now</Label>
          <div className="flex flex-wrap gap-2">
            {trendingKeywords.map(kw => (
              <Badge
                key={kw.keyword_phrase}
                variant={kw.tracked_for_cards ? "default" : "outline"}
                className="cursor-pointer transition-colors hover:bg-primary/80"
                onClick={() => toggleTracking(kw.keyword_phrase, kw.tracked_for_cards)}
              >
                {kw.tracked_for_cards && <Pin className="h-3 w-3 mr-1" />}
                {kw.keyword_phrase} ({kw.total_mentions})
                {kw.current_trend === 'fading' && (
                  <TrendingDown className="h-3 w-3 ml-1 text-orange-500" />
                )}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {trackedCount > 0 
              ? `${trackedCount} tracked • Auto-generates weekly`
              : "Tap to track • Auto-generates cards weekly"
            }
          </p>
        </div>
      )}

      {/* Minimal exclude list */}
      {excludedKeywords.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Excluded ({excludedKeywords.length})
          </summary>
          <div className="flex flex-wrap gap-1 mt-2">
            {excludedKeywords.map(k => (
              <Badge
                key={k}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => removeExcluded(k)}
              >
                {k} ×
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
