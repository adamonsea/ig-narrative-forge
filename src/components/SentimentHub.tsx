import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  RefreshCw, 
  Loader2, 
  Eye, 
  EyeOff, 
  Trash2,
  CheckCircle,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface SentimentCardData {
  id: string;
  topic_id: string;
  keyword_phrase: string;
  content: {
    headline: string;
    statistics: string;
    key_quote?: string;
    external_sentiment?: string;
    summary: string;
  };
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
  }>;
  sentiment_score: number;
  confidence_score: number;
  analysis_date: string;
  card_type: string;
  is_published: boolean;
  is_visible: boolean;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  slides?: Array<{
    type: 'hero' | 'mention-count' | 'sentiment-score' | 'confidence-score' | 'forum-insight' | 'quote' | 'references';
    content: string;
    order: number;
    metadata?: Record<string, any>;
  }>;
}

interface KeywordTracking {
  id: string;
  topic_id: string;
  keyword_phrase: string;
  total_mentions: number;
  positive_mentions?: number;
  negative_mentions?: number;
  neutral_mentions?: number;
  sentiment_ratio?: number;
  source_count: number;
  source_urls?: string[];
  tracked_for_cards: boolean;
  current_trend: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

interface SentimentHubProps {
  topicId: string;
}

export const SentimentHub: React.FC<SentimentHubProps> = ({ topicId }) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<KeywordTracking[]>([]);
  const [cards, setCards] = useState<SentimentCardData[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadData();
    
    // Real-time subscription for keywords
    const keywordsChannel = supabase
      .channel(`sentiment-keywords-${topicId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sentiment_keyword_tracking',
        filter: `topic_id=eq.${topicId}`
      }, () => loadData())
      .subscribe();
    
    // Real-time subscription for cards
    const cardsChannel = supabase
      .channel(`sentiment-cards-${topicId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sentiment_cards',
        filter: `topic_id=eq.${topicId}`
      }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(keywordsChannel);
      supabase.removeChannel(cardsChannel);
    };
  }, [topicId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load sentiment settings
      const { data: settings } = await supabase
        .from('topic_sentiment_settings')
        .select('*')
        .eq('topic_id', topicId)
        .single();

      setEnabled(settings?.enabled || false);
      setLastAnalysisAt(settings?.last_analysis_at || null);

      // Load keywords
      const { data: keywordsData } = await supabase
        .from('sentiment_keyword_tracking')
        .select('*')
        .eq('topic_id', topicId)
        .order('total_mentions', { ascending: false });

      // Cast to any since types haven't regenerated yet with new columns
      const keywords = (keywordsData || []) as any[];
      setKeywords(keywords.map(kw => ({
        ...kw,
        positive_mentions: kw.positive_mentions || 0,
        negative_mentions: kw.negative_mentions || 0,
        neutral_mentions: kw.neutral_mentions || 0,
        sentiment_ratio: kw.sentiment_ratio || 0,
        source_urls: kw.source_urls || []
      })));

      // Load cards
      const { data: cardsData } = await supabase
        .from('sentiment_cards')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      setCards((cardsData || []).map(card => ({
        ...card,
        content: card.content as any,
        sources: card.sources as any[],
        slides: card.slides as any[]
      })));
    } catch (err) {
      console.error('Error loading sentiment data:', err);
      toast({
        variant: 'destructive',
        title: 'Error loading sentiment data',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
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
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setEnabled(checked);
      toast({
        title: checked ? 'Sentiment analysis enabled' : 'Sentiment analysis paused',
        description: checked ? 'Automated sentiment tracking is now active' : 'Automated sentiment tracking is paused'
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error updating settings',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
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

      toast({
        title: 'Analysis started',
        description: 'Sentiment analysis is running. This may take a minute.'
      });

      await loadData();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error triggering analysis',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setTriggering(false);
    }
  };

  const toggleTracking = async (keywordId: string, currentlyTracked: boolean) => {
    try {
      setProcessingIds(prev => new Set(prev).add(keywordId));
      
      const { error } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ 
          tracked_for_cards: !currentlyTracked,
          updated_at: new Date().toISOString()
        })
        .eq('id', keywordId);

      if (error) throw error;

      toast({
        title: !currentlyTracked ? 'Keyword tracked' : 'Keyword untracked',
        description: !currentlyTracked ? 'Sentiment cards will be generated for this keyword' : 'Sentiment cards will not be generated'
      });

      await loadData();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error updating tracking',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(keywordId);
        return next;
      });
    }
  };

  const handlePublish = async (cardId: string) => {
    try {
      setProcessingIds(prev => new Set(prev).add(cardId));
      
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ 
          is_published: true,
          is_visible: true,
          needs_review: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', cardId);

      if (error) throw error;

      toast({
        title: 'Card published',
        description: 'Sentiment card is now visible in the feed'
      });

      await loadData();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error publishing card',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  };

  const handleToggleVisibility = async (cardId: string, currentlyVisible: boolean) => {
    try {
      setProcessingIds(prev => new Set(prev).add(cardId));
      
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ 
          is_visible: !currentlyVisible,
          updated_at: new Date().toISOString()
        })
        .eq('id', cardId);

      if (error) throw error;

      toast({
        title: !currentlyVisible ? 'Card shown' : 'Card hidden',
        description: !currentlyVisible ? 'Card is now visible in the feed' : 'Card is hidden from the feed'
      });

      await loadData();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error updating visibility',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  };

  const handleDelete = async (cardId: string) => {
    if (!confirm('Delete this sentiment card? This cannot be undone.')) return;

    try {
      setProcessingIds(prev => new Set(prev).add(cardId));
      
      const { error } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('id', cardId);

      if (error) throw error;

      toast({
        title: 'Card deleted',
        description: 'Sentiment card has been removed'
      });

      await loadData();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error deleting card',
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  };

  const getSentimentIcon = (ratio: number) => {
    if (ratio > 0.6) return <TrendingDown className="h-4 w-4 text-destructive" />;
    if (ratio < 0.3) return <TrendingUp className="h-4 w-4 text-green-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getSentimentBadge = (ratio: number) => {
    if (ratio > 0.6) return <Badge variant="destructive">High Negative</Badge>;
    if (ratio < 0.3) return <Badge className="bg-green-600">High Positive</Badge>;
    return <Badge variant="secondary">Balanced</Badge>;
  };

  const needsReviewCards = cards.filter(c => c.needs_review);
  const publishedCards = cards.filter(c => c.is_published && !c.needs_review && c.is_visible);
  const hiddenCards = cards.filter(c => !c.is_visible);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" id="sentiment">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sentiment Analysis</CardTitle>
              <CardDescription>
                Track community sentiment and generate insight cards
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {lastAnalysisAt && (
                <span className="text-sm text-muted-foreground">
                  Last run: {formatDistanceToNow(new Date(lastAnalysisAt), { addSuffix: true })}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Switch 
                  id="sentiment-enabled" 
                  checked={enabled} 
                  onCheckedChange={toggleEnabled}
                />
                <Label htmlFor="sentiment-enabled" className="cursor-pointer">
                  {enabled ? 'Enabled' : 'Paused'}
                </Label>
              </div>
              <Button 
                onClick={triggerAnalysis} 
                disabled={triggering}
                size="sm"
              >
                {triggering ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Run Analysis</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="keywords" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="keywords">
                Tracked Keywords ({keywords.length})
              </TabsTrigger>
              <TabsTrigger value="cards">
                Sentiment Cards ({publishedCards.length})
                {needsReviewCards.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{needsReviewCards.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="insights">
                Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="keywords" className="space-y-4 mt-4">
              {keywords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No keywords tracked yet. Run an analysis to get started.
                </div>
              ) : (
                <div className="grid gap-3">
                  {keywords.map(keyword => {
                    const total = keyword.total_mentions || 0;
                    const positive = keyword.positive_mentions || 0;
                    const negative = keyword.negative_mentions || 0;
                    const neutral = keyword.neutral_mentions || 0;
                    const ratio = keyword.sentiment_ratio || 0;
                    
                    return (
                      <div 
                        key={keyword.id} 
                        className="rounded-lg border border-border/60 bg-background/40 p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {getSentimentIcon(ratio)}
                              <span className="font-medium">{keyword.keyword_phrase}</span>
                              {getSentimentBadge(ratio)}
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                              {total} mentions · {keyword.source_count} sources
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                {total > 0 && (
                                  <>
                                    <div 
                                      className="h-full bg-destructive inline-block"
                                      style={{ width: `${(negative / total) * 100}%` }}
                                    />
                                    <div 
                                      className="h-full bg-muted-foreground/50 inline-block"
                                      style={{ width: `${(neutral / total) * 100}%` }}
                                    />
                                    <div 
                                      className="h-full bg-green-600 inline-block"
                                      style={{ width: `${(positive / total) * 100}%` }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              {negative} negative · {neutral} neutral · {positive} positive
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={keyword.tracked_for_cards}
                              onCheckedChange={() => toggleTracking(keyword.id, keyword.tracked_for_cards)}
                              disabled={processingIds.has(keyword.id)}
                            />
                            <Label className="text-xs text-muted-foreground">Track for Cards</Label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cards" className="space-y-6 mt-4">
              {needsReviewCards.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <h3 className="font-medium">Needs Review ({needsReviewCards.length})</h3>
                  </div>
                  {needsReviewCards.map(card => (
                    <Card key={card.id} className="border-destructive/50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{card.content.headline}</CardTitle>
                            <CardDescription>
                              {card.keyword_phrase} · {card.sources.length} sources
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handlePublish(card.id)}
                              disabled={processingIds.has(card.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Publish
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDelete(card.id)}
                              disabled={processingIds.has(card.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{card.content.summary}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {publishedCards.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Published Cards ({publishedCards.length})</h3>
                  {publishedCards.map(card => (
                    <Card key={card.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{card.content.headline}</CardTitle>
                            <CardDescription>
                              {card.keyword_phrase} · {card.sources.length} sources
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleToggleVisibility(card.id, card.is_visible)}
                              disabled={processingIds.has(card.id)}
                            >
                              {card.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDelete(card.id)}
                              disabled={processingIds.has(card.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}

              {hiddenCards.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-muted-foreground">Hidden Cards ({hiddenCards.length})</h3>
                  {hiddenCards.map(card => (
                    <Card key={card.id} className="opacity-60">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{card.content.headline}</CardTitle>
                            <CardDescription>
                              {card.keyword_phrase} · {card.sources.length} sources
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleToggleVisibility(card.id, card.is_visible)}
                              disabled={processingIds.has(card.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDelete(card.id)}
                              disabled={processingIds.has(card.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}

              {cards.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No sentiment cards yet. Enable tracking for keywords and run analysis.
                </div>
              )}
            </TabsContent>

            <TabsContent value="insights" className="space-y-4 mt-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Total Keywords</CardTitle>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{keywords.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {keywords.filter(k => k.tracked_for_cards).length} tracked for cards
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Cards Generated</CardTitle>
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{cards.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {publishedCards.length} published
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{needsReviewCards.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Awaiting approval
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Sentiment Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-destructive">Highly Negative</span>
                      <span className="font-medium">
                        {keywords.filter(k => k.sentiment_ratio > 0.6).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Balanced</span>
                      <span className="font-medium">
                        {keywords.filter(k => k.sentiment_ratio >= 0.3 && k.sentiment_ratio <= 0.6).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600">Highly Positive</span>
                      <span className="font-medium">
                        {keywords.filter(k => k.sentiment_ratio < 0.3).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
