import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official';
  confidence_score: number;
  rationale: string;
}

interface SourceSuggestionToolProps {
  topicName: string;
  description: string;
  keywords: string;
  topicType: 'regional' | 'keyword';
  region?: string;
  topicId?: string; // Will be provided after topic creation
}

export const SourceSuggestionTool = ({ 
  topicName, 
  description, 
  keywords, 
  topicType, 
  region,
  topicId 
}: SourceSuggestionToolProps) => {
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null);
  const { toast } = useToast();

  const getSuggestions = async () => {
    if (!topicName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic name first",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-content-sources', {
        body: {
          topicName,
          description,
          keywords,
          topicType,
          region
        }
      });

      if (error) throw error;

      // Check if the response indicates an error
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to get suggestions');
      }

      const suggestions = data?.suggestions || [];
      setSuggestions(suggestions);
      
      if (suggestions.length > 0) {
        toast({
          title: "Success",
          description: `Found ${suggestions.length} source suggestions`,
        });
      } else {
        toast({
          title: "No Results",
          description: "No source suggestions found. Try adjusting your topic details.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to get source suggestions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSource = async (suggestion: SourceSuggestion) => {
    const sourceKey = suggestion.url;
    setAddingSourceId(sourceKey);
    
    try {
      // Simple RSS feed validation for RSS sources
      if (suggestion.type === 'RSS') {
        try {
          const response = await fetch(suggestion.url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FeedValidator)' }
          });
          
          if (!response.ok) {
            throw new Error(`RSS feed returned ${response.status}`);
          }
          
          // Check content type hints for RSS
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
            console.warn('RSS feed may not be valid - unusual content type:', contentType);
          }
        } catch (error) {
          toast({
            title: "Invalid RSS Feed",
            description: `Cannot access RSS feed: ${error.message}`,
            variant: "destructive"
          });
          setAddingSourceId(null);
          return;
        }
      }
      
      // Extract domain for canonical_domain
      const domain = new URL(suggestion.url).hostname.replace('www.', '');
      
      const sourceData = {
        source_name: suggestion.source_name,
        feed_url: suggestion.url,
        canonical_domain: domain,
        content_type: 'news',
        credibility_score: Math.round(suggestion.confidence_score * 0.8), // Convert to 0-80 range
        is_active: true,
        topic_id: topicId, // Ensure topicId is always passed, not null
        source_type: suggestion.type === 'RSS' ? 'rss' : 'website',
        region: topicType === 'regional' ? region : null
      };

      const { error } = await supabase
        .from('content_sources')
        .insert([sourceData]);

      if (error) {
        // Check if it's a duplicate
        if (error.code === '23505') {
          toast({
            title: "Source Already Exists",
            description: "This source is already in your database",
            variant: "destructive"
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Source Added",
          description: `${suggestion.source_name} has been added to your sources`,
        });
        
        // Remove from suggestions after adding
        setSuggestions(suggestions.filter(s => s.url !== suggestion.url));
      }
    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: "Error",
        description: "Failed to add source",
        variant: "destructive"
      });
    } finally {
      setAddingSourceId(null);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">Source Suggestions</span>
        </div>
        <Button 
          onClick={getSuggestions}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Getting Suggestions...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Get Suggestions
            </>
          )}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Found {suggestions.length} relevant sources:
          </div>
          <div className="grid gap-3">
            {suggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.url}-${index}`}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm truncate">
                      {suggestion.source_name}
                    </h4>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs px-2 ${getConfidenceColor(suggestion.confidence_score)}`}
                    >
                      {suggestion.confidence_score}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.url}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {suggestion.rationale}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => addSource(suggestion)}
                  disabled={addingSourceId === suggestion.url}
                  className="ml-3 h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground"
                >
                  {addingSourceId === suggestion.url ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};