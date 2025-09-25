import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingUp, TrendingDown, Minus, ChevronDown, MessageCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface SentimentCard {
  id: string;
  keyword_phrase: string;
  content: {
    headline: string;
    summary: string;
    statistics: string;
  };
  sentiment_score: number;
  confidence_score: number;
  is_visible: boolean;
  needs_review: boolean;
  created_at: string;
}

interface SentimentInsightsProps {
  topicId: string;
  isExpanded?: boolean;
  onNavigateToSentiment?: () => void;
}

export const SentimentInsights = ({ topicId, isExpanded = false, onNavigateToSentiment }: SentimentInsightsProps) => {
  const [cards, setCards] = useState<SentimentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(isExpanded);
  const { toast } = useToast();

  useEffect(() => {
    if (topicId) {
      loadSentimentCards();
    }
  }, [topicId]);

  const loadSentimentCards = async () => {
    try {
      const { data, error } = await supabase
        .from('sentiment_cards')
        .select('*')
        .eq('topic_id', topicId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      
      setCards((data || []).map(card => ({
        ...card,
        content: card.content as any
      })));

    } catch (error) {
      console.error('Error loading sentiment cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (score: number) => {
    if (score > 20) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (score < -20) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-yellow-600" />;
  };

  const getSentimentColor = (score: number) => {
    if (score > 20) return "text-green-600 bg-green-50 border-green-200";
    if (score < -20) return "text-red-600 bg-red-50 border-red-200";
    return "text-yellow-600 bg-yellow-50 border-yellow-200";
  };

  const newCards = cards.filter(card => card.needs_review);
  const reviewedCards = cards.filter(card => !card.needs_review);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Sentiment Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (cards.length === 0) {
    return null; // Don't show if no sentiment data
  }

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Sentiment Insights
                {newCards.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {newCards.length} new
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </div>
            <CardDescription>
              Community sentiment trends from recent content
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Quick Summary */}
            <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {cards.length} active sentiment cards
                </span>
              </div>
              {newCards.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {newCards.length} need review
                </Badge>
              )}
            </div>

            {/* New Cards Needing Review */}
            {newCards.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-medium text-orange-600 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  New Sentiment Trends ({newCards.length})
                </h4>
                {newCards.map((card) => (
                  <div
                    key={card.id}
                    className="border border-orange-200 bg-orange-50/50 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getSentimentIcon(card.sentiment_score)}
                          <Badge variant="outline" className="text-xs">{card.keyword_phrase}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(card.created_at), 'MMM d')}
                          </span>
                        </div>
                        <h5 className="text-sm font-medium">{card.content.headline}</h5>
                        <p className="text-xs text-muted-foreground">
                          {card.content.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Sentiment Cards */}
            {reviewedCards.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Recent Community Trends
                </h4>
                {reviewedCards.slice(0, 3).map((card) => (
                  <div
                    key={card.id}
                    className={`border rounded-lg p-3 space-y-2 ${getSentimentColor(card.sentiment_score)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getSentimentIcon(card.sentiment_score)}
                          <Badge variant="outline" className="text-xs">{card.keyword_phrase}</Badge>
                          <span className="text-xs opacity-70">
                            {format(parseISO(card.created_at), 'MMM d')}
                          </span>
                        </div>
                        <p className="text-xs opacity-80">
                          {card.content.statistics}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">
                          {card.sentiment_score > 0 ? '+' : ''}{card.sentiment_score}
                        </div>
                        <div className="text-xs opacity-70">sentiment</div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {reviewedCards.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{reviewedCards.length - 3} more sentiment insights available
                  </p>
                )}
              </div>
            )}

            {/* Action Button */}
            <div className="mt-4 pt-3 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => {
                  if (onNavigateToSentiment) {
                    onNavigateToSentiment();
                  } else {
                    toast({
                      title: "Feature Available",
                      description: "Full sentiment management is available in Advanced Tools",
                    });
                  }
                }}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Manage All Sentiment Cards
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};