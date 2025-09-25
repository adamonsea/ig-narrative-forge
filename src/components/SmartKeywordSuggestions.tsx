import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hash, TrendingUp, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TrendingKeyword {
  keyword: string;
  frequency: number;
  sources: string[];
  recentMentions: number;
  confidence: number;
}

interface SmartKeywordSuggestionsProps {
  topicId: string;
  currentKeywords: string[];
  onKeywordAdd: (keyword: string) => void;
}

export const SmartKeywordSuggestions = ({ 
  topicId, 
  currentKeywords, 
  onKeywordAdd 
}: SmartKeywordSuggestionsProps) => {
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (topicId) {
      loadTrendingKeywords();
    }
  }, [topicId]);

  const loadTrendingKeywords = async () => {
    setLoading(true);
    try {
      // Get recent published stories for this topic (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          topic_articles!inner(
            id,
            topic_id,
            shared_content:shared_article_content(
              title,
              body,
              source_domain
            )
          )
        `)
        .eq('topic_articles.topic_id', topicId)
        .eq('status', 'published')
        .gte('created_at', sevenDaysAgo.toISOString())
        .limit(50);

      if (storiesError) throw storiesError;

      if (!stories || stories.length === 0) {
        setTrendingKeywords([]);
        return;
      }

      // Extract and analyze keywords from story content
      const keywords = extractKeywordsFromStories(stories);
      
      // Filter out existing keywords and low-confidence suggestions
      const suggestions = keywords
        .filter(kw => 
          !currentKeywords.some(existing => 
            existing.toLowerCase().includes(kw.keyword.toLowerCase()) ||
            kw.keyword.toLowerCase().includes(existing.toLowerCase())
          )
        )
        .filter(kw => kw.confidence > 0.6 && kw.frequency >= 2)
        .sort((a, b) => (b.frequency * b.confidence) - (a.frequency * a.confidence))
        .slice(0, 8);

      setTrendingKeywords(suggestions);

    } catch (error) {
      console.error('Error loading trending keywords:', error);
      toast({
        title: "Error",
        description: "Failed to load keyword suggestions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const extractKeywordsFromStories = (stories: any[]): TrendingKeyword[] => {
    const keywordMap = new Map<string, {
      frequency: number;
      sources: Set<string>;
      recentMentions: number;
    }>();

    stories.forEach(story => {
      const content = [
        story.title,
        story.topic_articles?.[0]?.shared_content?.title,
        story.topic_articles?.[0]?.shared_content?.body
      ].filter(Boolean).join(' ').toLowerCase();

      const sourceDomain = story.topic_articles?.[0]?.shared_content?.source_domain || 'unknown';

      // Extract meaningful phrases (2-4 words)
      const phrases = extractPhrases(content);
      
      phrases.forEach(phrase => {
        if (!keywordMap.has(phrase)) {
          keywordMap.set(phrase, {
            frequency: 0,
            sources: new Set(),
            recentMentions: 0
          });
        }
        
        const entry = keywordMap.get(phrase)!;
        entry.frequency++;
        entry.sources.add(sourceDomain);
        entry.recentMentions++;
      });
    });

    // Convert to array and calculate confidence scores
    return Array.from(keywordMap.entries()).map(([keyword, data]) => ({
      keyword,
      frequency: data.frequency,
      sources: Array.from(data.sources),
      recentMentions: data.recentMentions,
      confidence: Math.min(1, (data.frequency * data.sources.size) / 10)
    }));
  };

  const extractPhrases = (text: string): string[] => {
    // Simple keyword extraction - in production, you'd use more sophisticated NLP
    const words = text.match(/\b[a-z]+\b/g) || [];
    const phrases: string[] = [];
    
    // Extract 2-3 word phrases that might be relevant
    const commonWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'a', 'an']);
    
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      
      if (!commonWords.has(word1) && !commonWords.has(word2) && word1.length > 2 && word2.length > 2) {
        phrases.push(`${word1} ${word2}`);
      }
      
      // Three word phrases
      if (i < words.length - 2) {
        const word3 = words[i + 2];
        if (!commonWords.has(word3) && word3.length > 2) {
          phrases.push(`${word1} ${word2} ${word3}`);
        }
      }
    }
    
    return phrases;
  };

  const handleAddKeyword = async (keyword: string) => {
    try {
      await onKeywordAdd(keyword);
      
      // Remove from suggestions
      setTrendingKeywords(prev => 
        prev.filter(kw => kw.keyword !== keyword)
      );
      
      toast({
        title: "Keyword Added",
        description: `"${keyword}" has been added to your topic keywords`,
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Smart Keyword Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
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
          <Sparkles className="w-5 h-5" />
          Smart Keyword Suggestions
        </CardTitle>
        <CardDescription>
          Trending keywords from your recent published content
        </CardDescription>
      </CardHeader>
      <CardContent>
        {trendingKeywords.length === 0 ? (
          <div className="text-center py-6">
            <Hash className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              No new keyword suggestions found. Publish more content to see trends.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={loadTrendingKeywords}
            >
              Refresh Suggestions
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {trendingKeywords.slice(0, 5).map((keyword) => (
                <Badge
                  key={keyword.keyword}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-2 text-sm"
                  onClick={() => handleAddKeyword(keyword.keyword)}
                >
                  <TrendingUp className="w-3 h-3 mr-1" />
                  {keyword.keyword}
                  <Plus className="w-3 h-3 ml-2" />
                </Badge>
              ))}
            </div>
            
            {trendingKeywords.length > 5 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Show {trendingKeywords.length - 5} more suggestions...
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {trendingKeywords.slice(5).map((keyword) => (
                    <Badge
                      key={keyword.keyword}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => handleAddKeyword(keyword.keyword)}
                    >
                      {keyword.keyword}
                      <Plus className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </details>
            )}
            
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Based on {trendingKeywords.reduce((sum, kw) => sum + kw.frequency, 0)} mentions 
                from {new Set(trendingKeywords.flatMap(kw => kw.sources)).size} sources
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadTrendingKeywords}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};