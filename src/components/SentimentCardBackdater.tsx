import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface SentimentCard {
  id: string;
  keyword_phrase: string;
  analysis_date: string;
  is_published: boolean;
  created_at: string;
  sentiment_score: number;
}

interface SentimentCardBackdaterProps {
  topicId: string;
}

export const SentimentCardBackdater = ({ topicId }: SentimentCardBackdaterProps) => {
  const [cards, setCards] = useState<SentimentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPublishedCards();
  }, [topicId]);

  const loadPublishedCards = async () => {
    try {
      const { data, error } = await supabase
        .from('sentiment_cards')
        .select('id, keyword_phrase, analysis_date, is_published, created_at, sentiment_score')
        .eq('topic_id', topicId)
        .eq('is_published', true)
        .order('analysis_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCards(data || []);
    } catch (error) {
      console.error('Error loading published cards:', error);
      toast({
        title: "Error",
        description: "Failed to load published cards",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const backdateCard = async (cardId: string, newDate: string) => {
    if (!newDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive"
      });
      return;
    }

    setUpdating(cardId);
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ 
          analysis_date: newDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', cardId);

      if (error) throw error;

      // Update local state
      setCards(prev => prev.map(card => 
        card.id === cardId 
          ? { ...card, analysis_date: newDate }
          : card
      ));

      toast({
        title: "Success",
        description: "Card date updated successfully",
      });
    } catch (error) {
      console.error('Error backdating card:', error);
      toast({
        title: "Error",
        description: "Failed to update card date",
        variant: "destructive"
      });
    } finally {
      setUpdating(null);
    }
  };

  const getSentimentBadge = (score: number) => {
    if (score >= 65) return <Badge className="bg-green-100 text-green-800">Positive</Badge>;
    if (score >= 45) return <Badge variant="secondary">Neutral</Badge>;
    return <Badge variant="destructive">Negative</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Backdate Published Cards
        </CardTitle>
        <CardDescription>
          Change the analysis date for published sentiment cards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No published sentiment cards found
          </p>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div 
                key={card.id} 
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{card.keyword_phrase}</span>
                    {getSentimentBadge(card.sentiment_score)}
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Current: {format(parseISO(card.analysis_date), 'MMM d, yyyy')}</span>
                    <span>•</span>
                    <span>Created: {format(parseISO(card.created_at), 'MMM d, yyyy')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor={`date-${card.id}`} className="text-xs">New date:</Label>
                    <Input
                      id={`date-${card.id}`}
                      type="date"
                      defaultValue={card.analysis_date}
                      className="h-8 w-auto text-xs"
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        if (e.target.value) {
                          backdateCard(card.id, e.target.value);
                        }
                      }}
                      disabled={updating === card.id}
                    />
                    {updating === card.id && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
