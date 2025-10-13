import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Trash2, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SentimentCard } from "@/components/SentimentCard";

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
}

interface SentimentCardsReviewProps {
  topicId: string;
}

export const SentimentCardsReview = ({ topicId }: SentimentCardsReviewProps) => {
  const [cards, setCards] = useState<SentimentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Load all sentiment cards for this topic
  const loadCards = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sentiment_cards')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCards((data || []).map(card => ({
        ...card,
        content: card.content as any,
        sources: card.sources as any[]
      })));
    } catch (error) {
      console.error('Error loading sentiment cards:', error);
      toast({
        title: "Error",
        description: "Failed to load sentiment cards",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Publish a card
  const handlePublish = async (cardId: string) => {
    setProcessingIds(prev => new Set([...prev, cardId]));
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ 
          is_published: true, 
          needs_review: false,
          is_visible: true
        })
        .eq('id', cardId);

      if (error) throw error;
      
      toast({
        title: "Published",
        description: "Sentiment card published to feed",
      });
      await loadCards();
    } catch (error) {
      console.error('Error publishing card:', error);
      toast({
        title: "Error",
        description: "Failed to publish card",
        variant: "destructive"
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(cardId);
        return newSet;
      });
    }
  };

  // Toggle visibility
  const handleToggleVisibility = async (cardId: string, currentVisibility: boolean) => {
    setProcessingIds(prev => new Set([...prev, cardId]));
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ is_visible: !currentVisibility })
        .eq('id', cardId);

      if (error) throw error;
      
      toast({
        title: currentVisibility ? "Hidden" : "Shown",
        description: `Card ${currentVisibility ? 'hidden from' : 'shown in'} feed`,
      });
      await loadCards();
    } catch (error) {
      console.error('Error toggling visibility:', error);
      toast({
        title: "Error",
        description: "Failed to update visibility",
        variant: "destructive"
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(cardId);
        return newSet;
      });
    }
  };

  // Delete a card
  const handleDelete = async (cardId: string) => {
    if (!confirm('Are you sure you want to delete this sentiment card?')) return;
    
    setProcessingIds(prev => new Set([...prev, cardId]));
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('id', cardId);

      if (error) throw error;
      
      toast({
        title: "Deleted",
        description: "Sentiment card removed",
      });
      await loadCards();
    } catch (error) {
      console.error('Error deleting card:', error);
      toast({
        title: "Error",
        description: "Failed to delete card",
        variant: "destructive"
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(cardId);
        return newSet;
      });
    }
  };

  const getSentimentIcon = (score: number) => {
    if (score > 20) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (score < -20) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  // Load cards on mount
  useEffect(() => {
    loadCards();
  }, [topicId]);

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`sentiment-cards-review-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sentiment_cards',
          filter: `topic_id=eq.${topicId}`
        },
        () => loadCards()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId]);

  const needsReviewCards = cards.filter(c => c.needs_review);
  const publishedCards = cards.filter(c => c.is_published && c.is_visible);
  const hiddenCards = cards.filter(c => c.is_published && !c.is_visible);

  const renderCardList = (cardList: SentimentCardData[], showPublishButton = false) => {
    if (cardList.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No cards in this category</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {cardList.map(card => (
          <Card key={card.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {getSentimentIcon(card.sentiment_score)}
                    {card.keyword_phrase}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        Sentiment: {card.sentiment_score > 0 ? '+' : ''}{card.sentiment_score}
                      </Badge>
                      <Badge variant="outline">
                        Confidence: {card.confidence_score}%
                      </Badge>
                      <Badge variant="outline">
                        {card.sources.length} sources
                      </Badge>
                    </div>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {showPublishButton && (
                    <Button
                      size="sm"
                      onClick={() => handlePublish(card.id)}
                      disabled={processingIds.has(card.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Publish
                    </Button>
                  )}
                  {card.is_published && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleVisibility(card.id, card.is_visible)}
                      disabled={processingIds.has(card.id)}
                    >
                      {card.is_visible ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-1" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          Show
                        </>
                      )}
                    </Button>
                  )}
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
              <div className="max-w-sm mx-auto">
                <SentimentCard
                  id={card.id}
                  keywordPhrase={card.keyword_phrase}
                  content={card.content}
                  sources={card.sources}
                  sentimentScore={card.sentiment_score}
                  confidenceScore={card.confidence_score}
                  analysisDate={card.analysis_date}
                  cardType={card.card_type as any}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading sentiment cards...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="review" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="review">
            Needs Review ({needsReviewCards.length})
          </TabsTrigger>
          <TabsTrigger value="published">
            Published ({publishedCards.length})
          </TabsTrigger>
          <TabsTrigger value="hidden">
            Hidden ({hiddenCards.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review">
          {renderCardList(needsReviewCards, true)}
        </TabsContent>

        <TabsContent value="published">
          {renderCardList(publishedCards)}
        </TabsContent>

        <TabsContent value="hidden">
          {renderCardList(hiddenCards)}
        </TabsContent>
      </Tabs>
    </div>
  );
};
