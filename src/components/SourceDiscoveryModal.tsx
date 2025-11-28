import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, Plus, X, Sparkles } from 'lucide-react';
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

interface SourceDiscoveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  topicName: string;
  description?: string;
  keywords: string[];
  topicType: 'regional' | 'keyword';
  region?: string;
  onSourceAdded?: () => void;
}

const ENCOURAGING_MESSAGES = [
  "Quality sources are the foundation of a great feed",
  "Better sources = better content for your audience",
  "Scanning RSS feeds, WordPress & Substack sites...",
  "Great feeds start with reliable sources",
  "Finding the best content pipelines for you",
];

export const SourceDiscoveryModal = ({
  open,
  onOpenChange,
  topicId,
  topicName,
  description = '',
  keywords,
  topicType,
  region,
  onSourceAdded
}: SourceDiscoveryModalProps) => {
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingSourceId, setAddingSourceId] = useState<string | null>(null);
  const [addedSources, setAddedSources] = useState<Set<string>>(new Set());
  const [existingSourceUrls, setExistingSourceUrls] = useState<Set<string>>(new Set());
  const [messageIndex, setMessageIndex] = useState(0);
  const { toast } = useToast();

  // Rotate encouraging messages
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % ENCOURAGING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  // Fetch existing sources when modal opens
  useEffect(() => {
    if (open && topicId) {
      fetchExistingSources();
    }
  }, [open, topicId]);

  // Auto-discover on open if no suggestions
  useEffect(() => {
    if (open && suggestions.length === 0 && !loading) {
      getSuggestions();
    }
  }, [open]);

  const fetchExistingSources = async () => {
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
    try {
      const domain = new URL(suggestion.url).hostname.replace('www.', '').toLowerCase();
      return existingSourceUrls.has(url) || existingSourceUrls.has(domain);
    } catch {
      return existingSourceUrls.has(url);
    }
  };

  const getSuggestions = async () => {
    if (!topicName.trim()) return;

    setLoading(true);
    setMessageIndex(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('suggest-content-sources', {
        body: {
          topicName,
          description,
          keywords: keywords.join(', '),
          topicType,
          region,
          enhanced: true,
          focusPlatforms: ['WordPress', 'RSS', 'Substack', 'News'],
          excludeProblematic: true
        }
      });

      if (error) throw error;

      const allSuggestions = data?.suggestions || [];
      
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
      
      if (sortedSuggestions.length === 0) {
        toast({
          title: "No new sources found",
          description: "All suggested sources are already added or filtered out",
        });
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Discovery failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSource = async (suggestion: SourceSuggestion) => {
    setAddingSourceId(suggestion.url);
    
    try {
      const domain = new URL(suggestion.url).hostname.replace('www.', '');
      
      const { data: existingSource } = await supabase
        .from('content_sources')
        .select('id')
        .or(`feed_url.eq.${suggestion.url},canonical_domain.eq.${domain}`)
        .maybeSingle();

      let sourceId = existingSource?.id;

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

      const { error: linkError } = await supabase.rpc('add_source_to_topic', {
        p_topic_id: topicId,
        p_source_id: sourceId,
        p_source_config: {}
      });

      if (linkError) throw new Error(linkError.message);

      setAddedSources(prev => new Set([...prev, suggestion.url]));
      setExistingSourceUrls(prev => new Set([...prev, suggestion.url.toLowerCase(), domain.toLowerCase()]));
      setSuggestions(prev => prev.filter(s => s.url !== suggestion.url));
      
      toast({
        title: "Source added",
        description: suggestion.source_name,
      });

      onSourceAdded?.();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Source Discovery</DialogTitle>
          <DialogDescription>Finding quality sources for your feed</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Loading state - minimal, focused on message */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="relative">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <Sparkles className="w-3 h-3 absolute -top-0.5 -right-0.5 text-primary/60 animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-foreground">Finding sources</p>
                <p className="text-sm text-muted-foreground animate-in fade-in duration-500" key={messageIndex}>
                  {ENCOURAGING_MESSAGES[messageIndex]}
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && suggestions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {suggestions.length} found · tap to add
                </p>
                {addedSources.size > 0 && (
                  <span className="text-xs text-primary flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {addedSources.size} added
                  </span>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 max-h-[280px] overflow-y-auto py-1">
                {suggestions.map((suggestion) => {
                  const isAdding = addingSourceId === suggestion.url;
                  
                  return (
                    <div
                      key={suggestion.url}
                      className={cn(
                        "group relative inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-border/50 transition-all cursor-pointer",
                        "bg-background hover:bg-primary/5 hover:border-primary/30",
                        isAdding && "opacity-50 pointer-events-none"
                      )}
                      onClick={() => !isAdding && addSource(suggestion)}
                      title={suggestion.rationale}
                    >
                      <span className="text-xs">{getTypeIcon(suggestion.type)}</span>
                      <span className="text-sm max-w-[160px] truncate">
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
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={getSuggestions} className="text-muted-foreground">
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Find more
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && suggestions.length === 0 && (
            <div className="text-center py-10 space-y-4">
              {addedSources.size > 0 ? (
                <>
                  <CheckCircle className="w-8 h-8 text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">All done! Your feed is ready.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No new sources found</p>
                  <Button variant="outline" size="sm" onClick={getSuggestions}>
                    Try again
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
