import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pin, TrendingDown, Sparkles, Clock, Radio, TrendingUp, Activity, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface TrendingKeyword {
  keyword_phrase: string;
  total_mentions: number;
  source_count: number;
  current_trend: 'emerging' | 'sustained' | 'fading';
  tracked_for_cards: boolean;
  last_card_generated_at: string | null;
  next_card_due_at: string | null;
  total_cards_generated: number;
}

interface SentimentManagerProps {
  topicId: string;
}

export const SentimentManager = ({ topicId }: SentimentManagerProps) => {
  const [enabled, setEnabled] = useState(true);
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [topicId]);

  const loadData = async () => {
    try {
      // Load sentiment settings
      const { data: settings } = await supabase
        .from('topic_sentiment_settings')
        .select('enabled, excluded_keywords, last_analysis_at')
        .eq('topic_id', topicId)
        .single();

      if (settings) {
        setEnabled(settings.enabled);
        setExcludedKeywords(settings.excluded_keywords || []);
        setLastAnalysisAt(settings.last_analysis_at);
      }

      // Load trending keywords with tracking info
      const { data: keywords } = await supabase
        .from('sentiment_keyword_tracking')
        .select('keyword_phrase, total_mentions, source_count, current_trend, tracked_for_cards, last_card_generated_at, next_card_due_at, total_cards_generated')
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
      console.log('🚀 Triggering sentiment analysis...', { topicId });
      
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: { topic_id: topicId, force_analysis: true }
      });

      console.log('📊 Analysis response:', { data, error });

      if (error) {
        console.error('❌ Analysis failed:', error);
        throw error;
      }

      toast({
        title: "Analysis Complete",
        description: `Found ${data?.keywords_identified || 0} trending keywords, generated ${data?.cards_generated || 0} cards`
      });

      setTimeout(loadData, 2000);
    } catch (error) {
      console.error('💥 Error triggering analysis:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to trigger analysis. Check console for details.",
        variant: "destructive"
      });
    }
  };

  const toggleTracking = async (keywordPhrase: string, currentlyTracked: boolean) => {
    try {
      console.log('🔄 Toggling tracking for:', keywordPhrase);
      
      const { error } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ 
          tracked_for_cards: !currentlyTracked,
          next_card_due_at: !currentlyTracked ? new Date().toISOString() : null
        })
        .eq('topic_id', topicId)
        .eq('keyword_phrase', keywordPhrase);

      if (error) {
        console.error('❌ Failed to toggle tracking:', error);
        throw error;
      }

      setTrendingKeywords(prev => 
        prev.map(kw => 
          kw.keyword_phrase === keywordPhrase 
            ? { ...kw, tracked_for_cards: !currentlyTracked }
            : kw
        )
      );

      // If tracking was just enabled and sentiment is enabled, generate card immediately
      if (!currentlyTracked && enabled) {
        console.log('🎨 Triggering immediate card generation...');
        
        toast({
          title: "Generating Card",
          description: `Creating sentiment card for "${keywordPhrase}"...`
        });

        // Trigger immediate analysis to generate the card
        const { data, error: invokeError } = await supabase.functions.invoke('sentiment-detector', {
          body: { 
            topic_id: topicId, 
            mode: 'targeted',
            force_analysis: true 
          }
        });

        console.log('📊 Card generation response:', { data, error: invokeError });

        if (invokeError) {
          console.error('❌ Card generation failed:', invokeError);
          toast({
            title: "Generation Failed",
            description: invokeError.message || "Check console for details",
            variant: "destructive"
          });
        }

        setTimeout(loadData, 3000); // Reload data after generation
      } else {
        toast({
          title: !currentlyTracked ? "Tracking Enabled" : "Tracking Disabled",
          description: !currentlyTracked 
            ? `"${keywordPhrase}" will auto-generate cards weekly`
            : `Stopped tracking "${keywordPhrase}"`
        });
      }
    } catch (error) {
      console.error('💥 Error toggling tracking:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tracking. Check console for details.",
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
  
  // Filter keywords by status
  const risingKeywords = trendingKeywords.filter(k => 
    !k.tracked_for_cards && k.current_trend === 'emerging'
  );
  const trackedKeywordsList = trendingKeywords.filter(k => k.tracked_for_cards);
  const fadingKeywords = trendingKeywords.filter(k => 
    !k.tracked_for_cards && k.current_trend === 'fading'
  );

  return (
    <div className="space-y-3">
      {/* Last analysis timestamp */}
      {lastAnalysisAt && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last analysis: {formatDistanceToNow(new Date(lastAnalysisAt), { addSuffix: true })}
        </div>
      )}

      {/* Compact toggle + action row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
          <Label className="text-sm font-normal cursor-pointer" onClick={() => toggleEnabled(!enabled)}>
            {enabled ? 'Enabled' : 'Paused'}
          </Label>
          {enabled && trackedCount > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Radio className="h-3 w-3 animate-pulse text-green-500" />
              {trackedCount} live
            </Badge>
          )}
        </div>
        <Button onClick={triggerAnalysis} size="sm" variant="outline">
          <Sparkles className="h-4 w-4 mr-1" />
          Analyze
        </Button>
      </div>

      {/* Filter tabs for keywords */}
      <Tabs defaultValue="rising" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rising" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            Rising ({risingKeywords.length})
          </TabsTrigger>
          <TabsTrigger value="tracked" className="text-xs">
            <Radio className="h-3 w-3 mr-1" />
            Tracked ({trackedKeywordsList.length})
          </TabsTrigger>
          <TabsTrigger value="fading" className="text-xs">
            <TrendingDown className="h-3 w-3 mr-1" />
            Fading ({fadingKeywords.length})
          </TabsTrigger>
        </TabsList>

        {/* Rising Keywords */}
        <TabsContent value="rising" className="space-y-2">
          {risingKeywords.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {risingKeywords.map(kw => (
                  <Badge
                    key={kw.keyword_phrase}
                    variant="outline"
                    className="cursor-pointer transition-colors hover:bg-green-50 border-green-300 text-green-700 hover:border-green-400"
                    onClick={() => toggleTracking(kw.keyword_phrase, kw.tracked_for_cards)}
                  >
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {kw.keyword_phrase} ({kw.total_mentions})
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                ↗ Tap to track rising keywords and auto-generate cards
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No rising keywords detected yet</p>
          )}
        </TabsContent>

        {/* Tracked Keywords */}
        <TabsContent value="tracked" className="space-y-2">
          {trackedKeywordsList.length > 0 ? (
            <>
              <div className="space-y-2">
                {trackedKeywordsList.map(kw => (
                  <div
                    key={kw.keyword_phrase}
                    className="border rounded-lg p-2 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
                    onClick={() => toggleTracking(kw.keyword_phrase, kw.tracked_for_cards)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="default" className="text-xs">
                            <Pin className="h-3 w-3 mr-1" />
                            {kw.keyword_phrase}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {kw.total_mentions} mentions
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {kw.last_card_generated_at ? (
                            <>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last: {formatDistanceToNow(new Date(kw.last_card_generated_at), { addSuffix: true })}
                              </span>
                              <span>•</span>
                              <span>
                                {kw.total_cards_generated} {kw.total_cards_generated === 1 ? 'card' : 'cards'}
                              </span>
                            </>
                          ) : (
                            <span className="text-orange-600 font-medium">
                              Generating first card...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {enabled ? '✓ Auto-generating cards weekly' : '⏸ Paused - no new cards'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No keywords tracked yet. Check Rising tab to start.</p>
          )}
        </TabsContent>

        {/* Fading Keywords */}
        <TabsContent value="fading" className="space-y-2">
          {fadingKeywords.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {fadingKeywords.map(kw => (
                  <Badge
                    key={kw.keyword_phrase}
                    variant="outline"
                    className="cursor-pointer transition-colors hover:bg-orange-50 border-orange-300 text-orange-700 opacity-60"
                    onClick={() => toggleTracking(kw.keyword_phrase, kw.tracked_for_cards)}
                  >
                    <TrendingDown className="h-3 w-3 mr-1" />
                    {kw.keyword_phrase} ({kw.total_mentions})
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                ↘ Low activity keywords - tap to track anyway
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No fading keywords</p>
          )}
        </TabsContent>
      </Tabs>

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
