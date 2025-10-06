import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Trash2, TrendingUp, TrendingDown, Minus, Bell, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface SentimentCard {
  id: string;
  keyword_phrase: string;
  content: any;
  sources: any[];
  sentiment_score: number;
  confidence_score: number;
  analysis_date: string;
  card_type: string;
  is_visible: boolean;
  needs_review: boolean;
  created_at: string;
}

interface SentimentManagerProps {
  topicId: string;
}

// Add topic interface for the addSuggestedKeyword function
interface Topic {
  keywords?: string[];
}

// Sentiment Analysis Manager Component
export const SentimentManager = ({ topicId }: SentimentManagerProps) => {
  const [cards, setCards] = useState<SentimentCard[]>([]);
  const [settings, setSettings] = useState({
    enabled: true,
    excluded_keywords: [] as string[],
    analysis_frequency_hours: 24
  });
  const [newKeyword, setNewKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [keywordSuggestions, setKeywordSuggestions] = useState<any[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const { toast } = useToast();

  // Load sentiment cards and settings
  useEffect(() => {
    loadSentimentData();
  }, [topicId]);

  const loadSentimentData = async () => {
    try {
      // Load topic data
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('keywords')
        .eq('id', topicId)
        .single();

      if (topicError) throw topicError;
      setTopic(topicData);

      // Load cards
      const { data: cardsData, error: cardsError } = await supabase
        .from('sentiment_cards')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      if (cardsError) throw cardsError;
      setCards((cardsData || []).map(card => ({
        ...card,
        content: card.content as any,
        sources: card.sources as any[]
      })));

      // Load settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('topic_sentiment_settings')
        .select('*')
        .eq('topic_id', topicId)
        .single();

      if (settingsData) {
        setSettings({
          enabled: settingsData.enabled,
          excluded_keywords: settingsData.excluded_keywords || [],
          analysis_frequency_hours: settingsData.analysis_frequency_hours || 24
        });
      }

    } catch (error) {
      console.error('Error loading sentiment data:', error);
      toast({
        title: "Error",
        description: "Failed to load sentiment data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerAnalysis = async () => {
    console.log('🎯 Trigger Analysis button clicked for topic:', topicId);
    
    try {
      console.log('📡 Calling sentiment-detector function...');
      
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: {
          topic_id: topicId,
          force_analysis: true
        }
      });

      console.log('📊 Function response:', { data, error });

      if (error) throw error;

      // Extract keyword suggestions from response
      if (data?.keyword_suggestions) {
        setKeywordSuggestions(data.keyword_suggestions);
        console.log('📈 Keyword suggestions received:', data.keyword_suggestions);
      }

      const cardsGenerated = data?.cards_generated || 0;
      const suggestionsFound = data?.keyword_suggestions?.length || 0;
      
      toast({
        title: cardsGenerated > 0 ? "New Cards Created!" : "Analysis Complete",
        description: cardsGenerated > 0 
          ? `${cardsGenerated} new sentiment card${cardsGenerated > 1 ? 's' : ''} created! ${suggestionsFound} keyword suggestions found.`
          : `No new trending topics found in recent content. ${suggestionsFound} keyword suggestions available.`,
        variant: cardsGenerated > 0 ? "default" : "default"
      });

      console.log('✅ Analysis triggered successfully');

      // Reload data after a short delay
      setTimeout(() => {
        console.log('🔄 Reloading sentiment data...');
        loadSentimentData();
      }, 3000);

    } catch (error) {
      console.error('❌ Error triggering sentiment analysis:', error);
      toast({
        title: "Error",
        description: `Failed to trigger sentiment analysis: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const updateSettings = async (newSettings: Partial<typeof settings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      const { error } = await supabase
        .from('topic_sentiment_settings')
        .upsert({
          topic_id: topicId,
          ...updatedSettings
        });

      if (error) throw error;

      setSettings(updatedSettings);
      toast({
        title: "Settings Updated",
        description: "Sentiment tracking settings have been saved"
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      });
    }
  };

  const toggleCardVisibility = async (cardId: string, isVisible: boolean) => {
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ is_visible: isVisible })
        .eq('id', cardId);

      if (error) throw error;

      setCards(cards.map(card => 
        card.id === cardId ? { ...card, is_visible: isVisible } : card
      ));

      toast({
        title: isVisible ? "Card Shown" : "Card Hidden",
        description: `Sentiment card has been ${isVisible ? 'shown' : 'hidden'} from feeds`
      });
    } catch (error) {
      console.error('Error toggling card visibility:', error);
      toast({
        title: "Error",
        description: "Failed to update card visibility",
        variant: "destructive"
      });
    }
  };

  const markAsReviewed = async (cardId: string) => {
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .update({ needs_review: false })
        .eq('id', cardId);

      if (error) throw error;

      setCards(cards.map(card => 
        card.id === cardId ? { ...card, needs_review: false } : card
      ));
    } catch (error) {
      console.error('Error marking card as reviewed:', error);
    }
  };

  const deleteCard = async (cardId: string) => {
    try {
      const { error } = await supabase
        .from('sentiment_cards')
        .delete()
        .eq('id', cardId);

      if (error) throw error;

      setCards(cards.filter(card => card.id !== cardId));
      toast({
        title: "Card Deleted",
        description: "Sentiment card has been permanently removed"
      });
    } catch (error) {
      console.error('Error deleting card:', error);
      toast({
        title: "Error",
        description: "Failed to delete card",
        variant: "destructive"
      });
    }
  };

  const addExcludedKeyword = () => {
    if (newKeyword.trim() && !settings.excluded_keywords.includes(newKeyword.trim())) {
      updateSettings({
        excluded_keywords: [...settings.excluded_keywords, newKeyword.trim()]
      });
      setNewKeyword("");
    }
  };

  const addSuggestedKeyword = async (keyword: string) => {
    try {
      // Add to topic keywords
      const { error } = await supabase
        .from('topics')
        .update({ 
          keywords: [...(topic?.keywords || []), keyword] 
        })
        .eq('id', topicId);

      if (error) throw error;

      // Remove from suggestions
      setKeywordSuggestions(prev => prev.filter(s => s.keyword !== keyword));

      toast({
        title: "Keyword Added",
        description: `"${keyword}" has been added to your topic keywords`
      });
    } catch (error) {
      console.error('Error adding keyword:', error);
      toast({
        title: "Error",
        description: "Failed to add keyword",
        variant: "destructive"
      });
    }
  };

  const removeExcludedKeyword = (keyword: string) => {
    updateSettings({
      excluded_keywords: settings.excluded_keywords.filter(k => k !== keyword)
    });
  };

  const getSentimentIcon = (score: number) => {
    if (score > 20) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (score < -20) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-yellow-600" />;
  };

  const newCards = cards.filter(card => card.needs_review);
  const reviewedCards = cards.filter(card => !card.needs_review);

  if (loading) {
    return <div className="p-4">Loading sentiment data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Sentiment Tracking Settings
          </CardTitle>
          <CardDescription>
            Configure automated sentiment analysis for this topic
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sentiment-enabled">Enable sentiment tracking</Label>
            <Switch
              id="sentiment-enabled"
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Manual Analysis</Label>
              <p className="text-sm text-muted-foreground">
                Generate sentiment cards from recent articles
              </p>
            </div>
            <Button onClick={triggerAnalysis} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              Run Analysis
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Excluded Keywords</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add keyword to exclude..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addExcludedKeyword()}
              />
              <Button onClick={addExcludedKeyword} variant="outline">
                Add
              </Button>
            </div>
            {settings.excluded_keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {settings.excluded_keywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeExcludedKeyword(keyword)}
                  >
                    {keyword} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* New Cards Needing Review */}
      {newCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              New Sentiment Cards ({newCards.length})
            </CardTitle>
            <CardDescription>
              These cards were automatically generated and need review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {newCards.map((card) => (
                <div
                  key={card.id}
                  className="border border-orange-200 bg-orange-50/30 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getSentimentIcon(card.sentiment_score)}
                        <Badge variant="outline">{card.keyword_phrase}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(card.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <h4 className="font-medium">{card.content.headline}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {card.content.summary}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleCardVisibility(card.id, !card.is_visible)}
                      >
                        {card.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAsReviewed(card.id)}
                      >
                        Mark Reviewed
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteCard(card.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Keyword Suggestions */}
          {keywordSuggestions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Trending Keywords Found
                </Label>
                <p className="text-sm text-muted-foreground">
                  Keywords extracted from your published content that could enhance targeting
                </p>
                <div className="flex flex-wrap gap-2">
                  {keywordSuggestions.map((suggestion) => (
                    <Badge
                      key={suggestion.keyword}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => addSuggestedKeyword(suggestion.keyword)}
                      title={`${suggestion.frequency} mentions, ${suggestion.sources_count} sources, ${suggestion.confidence}% confidence`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {suggestion.keyword}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to add keywords to your topic • Based on {keywordSuggestions.reduce((sum, s) => sum + s.sources_count, 0)} sources
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* All Sentiment Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            All Sentiment Cards ({cards.length})
          </CardTitle>
          <CardDescription>
            Manage all sentiment cards for this topic
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No sentiment cards generated yet. Cards will appear automatically as trends are detected.
            </p>
          ) : (
            <div className="grid gap-4">
              {reviewedCards.map((card) => (
                <div
                  key={card.id}
                  className={`border rounded-lg p-4 space-y-3 ${
                    card.is_visible 
                      ? 'border-border bg-background' 
                      : 'border-border/50 bg-muted/30 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getSentimentIcon(card.sentiment_score)}
                        <Badge variant="outline">{card.keyword_phrase}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(card.analysis_date), 'MMM d')}
                        </span>
                      </div>
                      <h4 className="font-medium">{card.content.headline}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {card.content.statistics}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleCardVisibility(card.id, !card.is_visible)}
                      >
                        {card.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteCard(card.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};