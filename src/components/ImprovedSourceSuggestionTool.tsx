import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Rss, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official' | 'WordPress' | 'Substack';
  confidence_score: number;
  rationale: string;
  platform_reliability?: 'high' | 'medium' | 'low';
}

interface ImprovedSourceSuggestionToolProps {
  topicName: string;
  description: string;
  keywords: string;
  topicType: 'regional' | 'keyword';
  region?: string;
  topicId?: string;
  autoTrigger?: boolean;
  onTriggered?: () => void;
}

export const ImprovedSourceSuggestionTool = ({ 
  topicName, 
  description, 
  keywords, 
  topicType, 
  region,
  topicId,
  autoTrigger = false,
  onTriggered
}: ImprovedSourceSuggestionToolProps) => {
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null);
  const [addedSources, setAddedSources] = useState<Set<string>>(new Set());
  const [existingSourceUrls, setExistingSourceUrls] = useState<Set<string>>(new Set());
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const { toast } = useToast();

  // Fetch existing topic sources on mount
  useEffect(() => {
    if (topicId) {
      fetchExistingSources();
    }
  }, [topicId]);

  // Auto-trigger suggestions
  useEffect(() => {
    if (autoTrigger && !hasAutoTriggered && topicName.trim()) {
      setHasAutoTriggered(true);
      getSuggestions();
      onTriggered?.();
    }
  }, [autoTrigger, hasAutoTriggered, topicName]);

  const fetchExistingSources = async () => {
    if (!topicId) return;

    const { data } = await supabase
      .from('topic_sources')
      .select('source_id, content_sources!inner(feed_url, canonical_domain)')
      .eq('topic_id', topicId);

    if (data) {
      const urls = new Set<string>();
      data.forEach((ts: any) => {
        if (ts.content_sources?.feed_url) {
          urls.add(ts.content_sources.feed_url.toLowerCase());
        }
        if (ts.content_sources?.canonical_domain) {
          urls.add(ts.content_sources.canonical_domain.toLowerCase());
        }
      });
      setExistingSourceUrls(urls);
    }
  };

  const isSourceAlreadyLinked = (suggestion: SourceSuggestion): boolean => {
    const url = suggestion.url.toLowerCase();
    const domain = new URL(suggestion.url).hostname.replace('www.', '').toLowerCase();
    return existingSourceUrls.has(url) || existingSourceUrls.has(domain);
  };

  const getSuggestions = async () => {
    if (!topicName.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-content-sources', {
        body: {
          topicName,
          description,
          keywords,
          topicType,
          region,
          enhanced: true,
          focusPlatforms: ['WordPress', 'RSS', 'Substack', 'News'],
          excludeProblematic: true
        }
      });

      if (error) throw error;

      const allSuggestions = data?.suggestions || [];
      
      // Filter and sort
      const filteredSuggestions = allSuggestions.filter((s: SourceSuggestion) => {
        if (s.confidence_score < 60) return false;
        
        const url = s.url.toLowerCase();
        const problematicPatterns = [
          'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
          'reddit.com', 'pinterest.com', 'linkedin.com',
          'blogspot', 'tumblr', 'medium.com', 'youtube.com', 'vimeo.com'
        ];
        
        if (problematicPatterns.some(p => url.includes(p))) return false;
        if (s.platform_reliability === 'low') return false;
        
        // Filter out already linked sources
        if (isSourceAlreadyLinked(s)) return false;
        
        return true;
      });

      const sortedSuggestions = filteredSuggestions.sort((a: SourceSuggestion, b: SourceSuggestion) => {
        const score = (s: SourceSuggestion) => {
          let sc = s.confidence_score;
          if (s.platform_reliability === 'high') sc += 25;
          if (s.platform_reliability === 'medium') sc += 15;
          if (['WordPress', 'RSS', 'Substack', 'News'].includes(s.type)) sc += 20;
          return sc;
        };
        return score(b) - score(a);
      });

      setSuggestions(sortedSuggestions);
      
      if (sortedSuggestions.length > 0) {
        toast({
          title: `Found ${sortedSuggestions.length} sources`,
          description: "Click to add them to your feed",
        });
      } else {
        toast({
          title: "No new sources found",
          description: "Try adjusting your keywords or check back later",
        });
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Connection issue",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSource = async (suggestion: SourceSuggestion) => {
    if (!topicId) {
      toast({
        title: "Error",
        description: "Topic ID required",
        variant: "destructive"
      });
      return;
    }

    setAddingSourceId(suggestion.url);
    
    try {
      const domain = new URL(suggestion.url).hostname.replace('www.', '');
      
      // Check if source exists
      const { data: existingSource } = await supabase
        .from('content_sources')
        .select('id')
        .or(`feed_url.eq.${suggestion.url},canonical_domain.eq.${domain}`)
        .maybeSingle();

      let sourceId = existingSource?.id;

      // Create source if not exists
      if (!sourceId) {
        let credibilityScore = Math.round(suggestion.confidence_score * 0.8);
        if (suggestion.platform_reliability === 'high') credibilityScore += 15;
        if (suggestion.platform_reliability === 'medium') credibilityScore += 10;
        credibilityScore = Math.min(95, credibilityScore);

        const { data: newSource, error: createError } = await supabase
          .from('content_sources')
          .insert({
            source_name: suggestion.source_name,
            feed_url: suggestion.url,
            canonical_domain: domain,
            content_type: 'news',
            credibility_score: credibilityScore,
            is_active: true,
            source_type: suggestion.type === 'RSS' ? 'rss' : 'website',
            region: topicType === 'regional' ? region : null
          })
          .select('id')
          .single();

        if (createError) throw createError;
        sourceId = newSource.id;
      }

      // Link to topic
      const { error: linkError } = await supabase.rpc('add_source_to_topic', {
        p_topic_id: topicId,
        p_source_id: sourceId,
        p_source_config: {}
      });

      if (linkError) throw new Error(linkError.message);

      // Update state
      setAddedSources(prev => new Set([...prev, suggestion.url]));
      setExistingSourceUrls(prev => new Set([...prev, suggestion.url.toLowerCase(), domain.toLowerCase()]));
      setSuggestions(prev => prev.filter(s => s.url !== suggestion.url));
      
      toast({
        title: "Source added",
        description: suggestion.source_name,
      });

      window.dispatchEvent(new CustomEvent('sourceAdded'));

    } catch (error) {
      console.error('Error adding source:', error);
      toast({
        title: "Failed to add",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    } finally {
      setAddingSourceId(null);
    }
  };

  const dismissSuggestion = (suggestion: SourceSuggestion) => {
    setSuggestions(prev => prev.filter(s => s.url !== suggestion.url));
  };

  const getTypeIcon = (type: string) => {
    if (type === 'RSS') return '📡';
    if (type === 'WordPress') return '📝';
    if (type === 'Substack') return '📰';
    if (type === 'News') return '🗞️';
    return '🌐';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {addedSources.size > 0 && (
            <span className="text-accent-green">{addedSources.size} added</span>
          )}
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
              Finding...
            </>
          ) : (
            <>
              <Rss className="w-4 h-4 mr-2" />
              Find Sources
            </>
          )}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 p-4 bg-background-elevated rounded-lg border border-border/50">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm">Searching for RSS feeds and reliable sources...</span>
        </div>
      )}

      {/* Pill-based suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Click to add • {suggestions.length} available
          </p>
          
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => {
              const isAdding = addingSourceId === suggestion.url;
              
              return (
                <div
                  key={suggestion.url}
                  className={cn(
                    "group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer",
                    "bg-background hover:bg-accent hover:border-primary/50",
                    isAdding && "opacity-50 pointer-events-none"
                  )}
                  onClick={() => !isAdding && addSource(suggestion)}
                  title={`${suggestion.rationale} • ${suggestion.url}`}
                >
                  <span className="text-sm">{getTypeIcon(suggestion.type)}</span>
                  <span className="text-sm font-medium max-w-[200px] truncate">
                    {suggestion.source_name}
                  </span>
                  
                  {isAdding ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissSuggestion(suggestion);
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {addedSources.size > 0 
            ? "All suggested sources have been added or dismissed"
            : "Click 'Find Sources' to discover RSS feeds for your topic"
          }
        </p>
      )}
    </div>
  );
};
