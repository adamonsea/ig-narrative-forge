import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TrendingUp, TrendingDown, Eye, EyeOff, Trash2, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface KeywordTracking {
  id: string;
  keyword_phrase: string;
  total_mentions: number;
  sentiment_ratio: number;
  source_count: number;
  status: 'pending_review' | 'published' | 'discarded' | 'hidden';
  published_at?: string;
  discarded_at?: string;
  review_due_at?: string;
  created_at: string;
}

interface TrendingKeywordsReviewProps {
  topicId: string;
  enabled: boolean;
}

export const TrendingKeywordsReview = ({ topicId, enabled }: TrendingKeywordsReviewProps) => {
  const [keywords, setKeywords] = useState<KeywordTracking[]>([]);
  const [loading, setLoading] = useState(false);

  const loadKeywords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sentiment_keyword_tracking')
        .select('*')
        .eq('topic_id', topicId)
        .order('total_mentions', { ascending: false });

      if (error) throw error;
      setKeywords((data || []).map(k => ({
        ...k,
        status: k.status as 'pending_review' | 'published' | 'discarded' | 'hidden'
      })));
    } catch (error) {
      console.error('Error loading keywords:', error);
      toast.error('Failed to load keywords');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) {
      loadKeywords();
    }

    const channel = supabase
      .channel(`sentiment-keywords-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sentiment_keyword_tracking',
          filter: `topic_id=eq.${topicId}`
        },
        () => loadKeywords()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId, enabled]);

  const handleClearAll = async () => {
    try {
      const { error } = await supabase
        .from('sentiment_keyword_tracking')
        .delete()
        .eq('topic_id', topicId);

      if (error) throw error;

      toast.success('All keywords cleared');
      loadKeywords();
    } catch (error: any) {
      console.error('Error clearing keywords:', error);
      toast.error('Failed to clear keywords');
    }
  };

  const handleRegenerateCards = async () => {
    try {
      setLoading(true);
      
      // Delete all existing sentiment cards for this topic
      const { error: deleteError } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('topic_id', topicId);

      if (deleteError) throw deleteError;

      // Get all published keywords
      const publishedKeywords = keywords.filter(k => k.status === 'published');
      
      // Regenerate cards for each published keyword
      let successCount = 0;
      for (const keyword of publishedKeywords) {
        const { error } = await supabase.functions.invoke('generate-sentiment-card', {
          body: { keywordId: keyword.id }
        });
        if (!error) successCount++;
      }

      toast.success(`Regenerated ${successCount} sentiment cards with sources and comparisons`);
      loadKeywords();
    } catch (error: any) {
      console.error('Error regenerating cards:', error);
      toast.error('Failed to regenerate cards');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (keywordId: string) => {
    try {
      // Call edge function to generate detail card
      const { error } = await supabase.functions.invoke('generate-sentiment-card', {
        body: { keywordId }
      });

      if (error) throw error;
      toast.success('Keyword published and card generated');
      loadKeywords();
    } catch (error) {
      console.error('Error publishing keyword:', error);
      toast.error('Failed to publish keyword');
    }
  };

  const handleDiscard = async (keywordId: string) => {
    try {
      // Get the keyword to find its phrase
      const keyword = keywords.find(k => k.id === keywordId);
      if (!keyword) throw new Error('Keyword not found');

      // Update keyword status
      const { error: keywordError } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ status: 'discarded', discarded_at: new Date().toISOString() })
        .eq('id', keywordId);

      if (keywordError) throw keywordError;

      // Delete associated sentiment cards
      const { error: cardError } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('topic_id', topicId)
        .eq('keyword_phrase', keyword.keyword_phrase);

      if (cardError) throw cardError;

      toast.success('Keyword and associated cards discarded');
      loadKeywords();
    } catch (error) {
      console.error('Error discarding keyword:', error);
      toast.error('Failed to discard keyword');
    }
  };

  const handleHide = async (keywordId: string) => {
    try {
      // Get the keyword to find its phrase
      const keyword = keywords.find(k => k.id === keywordId);
      if (!keyword) throw new Error('Keyword not found');

      // Update keyword status
      const { error: keywordError } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ status: 'hidden' })
        .eq('id', keywordId);

      if (keywordError) throw keywordError;

      // Delete associated sentiment cards
      const { error: cardError } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('topic_id', topicId)
        .eq('keyword_phrase', keyword.keyword_phrase);

      if (cardError) throw cardError;

      toast.success('Keyword and associated cards hidden');
      loadKeywords();
    } catch (error) {
      console.error('Error hiding keyword:', error);
      toast.error('Failed to hide keyword');
    }
  };

  const handleReReview = async (keywordId: string) => {
    try {
      const { error } = await supabase
        .from('sentiment_keyword_tracking')
        .update({ status: 'pending_review' })
        .eq('id', keywordId);

      if (error) throw error;
      toast.success('Keyword moved to pending review');
      loadKeywords();
    } catch (error) {
      console.error('Error re-reviewing keyword:', error);
      toast.error('Failed to re-review keyword');
    }
  };

  const getSentimentBadge = (ratio: number) => {
    if (ratio >= 0.7) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><TrendingUp className="w-3 h-3 mr-1" />Positive</Badge>;
    if (ratio <= 0.3) return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><TrendingDown className="w-3 h-3 mr-1" />Negative</Badge>;
    return <Badge variant="outline">Neutral</Badge>;
  };

  const pending = keywords.filter(k => k.status === 'pending_review');
  const published = keywords.filter(k => k.status === 'published');
  const discarded = keywords.filter(k => k.status === 'discarded');
  const dueForReview = published.filter(k => k.review_due_at && new Date(k.review_due_at) <= new Date());

  if (!enabled) {
    return (
      <Alert className="border-yellow-500/20 bg-yellow-500/5">
        <Lock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-600">Premium Feature</AlertTitle>
        <AlertDescription className="text-yellow-600/80">
          Sentiment analysis and trending keywords are available on Pro plans and above.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>
              Review and manage detected sentiment keywords
            </CardDescription>
          </div>
          <Button 
            onClick={handleRegenerateCards} 
            disabled={loading || published.length === 0}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate Cards
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pending" className="w-full" onValueChange={loadKeywords}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="pending">
          Pending ({pending.length})
        </TabsTrigger>
        <TabsTrigger value="published">
          Published ({published.length})
        </TabsTrigger>
        <TabsTrigger value="discarded">
          Discarded ({discarded.length})
        </TabsTrigger>
        <TabsTrigger value="due">
          Due ({dueForReview.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="space-y-3">
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No keywords pending review</p>
        ) : (
          pending.map(kw => (
            <Card key={kw.id} className="border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{kw.keyword_phrase}</h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{kw.total_mentions} mentions</span>
                      <span>•</span>
                      <span>{kw.source_count} sources</span>
                      <span>•</span>
                      {getSentimentBadge(kw.sentiment_ratio)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => handlePublish(kw.id)}>Publish</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDiscard(kw.id)}>Discard</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="published" className="space-y-3">
        {published.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No published keywords</p>
        ) : (
          published.map(kw => (
            <Card key={kw.id} className="border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground truncate">{kw.keyword_phrase}</h4>
                      <Badge variant="outline" className="text-xs shrink-0">Detail Card</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{kw.total_mentions} mentions</span>
                      <span>•</span>
                      {getSentimentBadge(kw.sentiment_ratio)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleHide(kw.id)}>
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="discarded" className="space-y-3">
        {discarded.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No discarded keywords</p>
        ) : (
          discarded.map(kw => (
            <Card key={kw.id} className="border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{kw.keyword_phrase}</h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{kw.total_mentions} current mentions</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">Auto-resurface at 3+ new mentions</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleReReview(kw.id)}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Re-review
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="due" className="space-y-3">
        {dueForReview.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No keywords due for re-assessment</p>
        ) : (
          dueForReview.map(kw => (
            <Card key={kw.id} className="border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{kw.keyword_phrase}</h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{kw.total_mentions} mentions</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs text-orange-600">Due for review</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => handlePublish(kw.id)}>Re-publish</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDiscard(kw.id)}>Discard</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleHide(kw.id)}>
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
    </Tabs>
      </CardContent>
    </Card>
  );
};
