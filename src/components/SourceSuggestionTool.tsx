import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Loader2 } from 'lucide-react';
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
          title: "Sources Found",
          description: `Found ${suggestions.length} relevant sources`,
        });
      } else {
        toast({
          title: "No Results",
          description: "No relevant sources found. Try adjusting your topic details.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to find sources",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkExistingSource = async (suggestion: SourceSuggestion): Promise<{exists: boolean, id?: string}> => {
    const domain = new URL(suggestion.url).hostname.replace('www.', '');
    
    // Check if source already exists for this topic via junction table
    const { data: existingJunction } = await supabase
      .from('topic_sources')
      .select(`
        id,
        content_sources!inner(
          id,
          source_name,
          canonical_domain,
          feed_url
        )
      `)
      .eq('topic_id', topicId)
      .eq('is_active', true)
      .or(`content_sources.feed_url.eq.${suggestion.url},content_sources.canonical_domain.eq.${domain}`);

    if (existingJunction && existingJunction.length > 0) {
      return {
        exists: true,
        id: existingJunction[0].content_sources.id
      };
    }
    
    return { exists: false };
  };

  // Removed assignExistingSource function - no longer needed with topic-scoped approach

  const addSource = async (suggestion: SourceSuggestion, skipValidation = false) => {
    const sourceKey = suggestion.url;
    setAddingSourceId(sourceKey);
    
    try {
      // Check if source already exists for THIS topic (topic-scoped check)
      const existingCheck = await checkExistingSource(suggestion);
      
      if (existingCheck.exists) {
        toast({
          title: "Source Already Added",
          description: "This source is already assigned to this topic",
          variant: "destructive"
        });
        setAddingSourceId(null);
        return;
      }

      // ENHANCED VALIDATION: Pre-validate sources before adding
      if (!skipValidation) {
        try {
          const { data: validationResult, error: validationError } = await supabase.functions.invoke('validate-content-source', {
            body: {
              url: suggestion.url,
              sourceType: suggestion.type,
              topicType,
              region,
              topicId
            }
          });

          // Strict validation - only add sources that pass validation
          if (validationError || (validationResult && !validationResult.success)) {
            const errorMsg = validationResult?.error || validationError?.message || 'Source validation failed';
            toast({
              title: "Source Validation Failed",
              description: `Skipping ${suggestion.source_name}: ${errorMsg.substring(0, 100)}...`,
              variant: "destructive"
            });
            setAddingSourceId(null);
            return;
          }

          // Show informative feedback based on validation results
          if (validationResult?.warnings?.length > 0) {
            toast({
              title: "Source Added with Warnings",
              description: `${suggestion.source_name} added but may need monitoring (${validationResult.warnings.length} warnings)`,
            });
          } else {
            toast({
              title: "Source Validated Successfully",
              description: `${suggestion.source_name} passed all validation checks`,
            });
          }
        } catch (error) {
          // Validation service failed - don't add source for safety
          console.error('Validation service failed:', error);
          toast({
            title: "Validation Service Unavailable",
            description: "Cannot add source without validation - please try again later",
            variant: "destructive"
          });
          setAddingSourceId(null);
          return;
        }
      }
      
      // Extract domain for canonical_domain
      const domain = new URL(suggestion.url).hostname.replace('www.', '');
      
      // Check if source exists globally first (we can reuse it)
      const { data: existingSource } = await supabase
        .from('content_sources')
        .select('id, source_name')
        .eq('feed_url', suggestion.url)
        .maybeSingle();

      let sourceId = existingSource?.id;

      // If source doesn't exist globally, create it
      if (!sourceId) {
        const { data: newSource, error: createError } = await supabase
          .from('content_sources')
          .insert({
            source_name: suggestion.source_name,
            feed_url: suggestion.url,
            canonical_domain: domain,
            content_type: 'news',
            credibility_score: Math.round(suggestion.confidence_score * 0.8),
            is_active: true,
            source_type: suggestion.type === 'RSS' ? 'rss' : 'website',
            region: topicType === 'regional' ? region : null
            // NO topic_id - sources are now global
          })
          .select('id')
          .single();

        if (createError) throw createError;
        sourceId = newSource.id;
      }

      // Add source to topic via junction table
      const { error: junctionError } = await supabase
        .from('topic_sources')
        .insert({
          topic_id: topicId,
          source_id: sourceId,
          is_active: true,
        });

      if (junctionError) {
        if (junctionError.code === '23505') {
          toast({
            title: "Source Already Added",
            description: "This source is already active for this topic",
            variant: "destructive"
          });
        } else {
          throw junctionError;
        }
      } else {
        toast({
          title: "Source Added Successfully",
          description: existingSource 
            ? `${suggestion.source_name} (existing source) added to topic`
            : `${suggestion.source_name} created and added to topic`,
        });
        
        // Remove from suggestions after adding
        setSuggestions(suggestions.filter(s => s.url !== suggestion.url));
        
        // Trigger parent refresh to show new source in list
        window.dispatchEvent(new CustomEvent('sourceAdded'));
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
        <h3 className="text-sm font-medium">Find Sources</h3>
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
              <Search className="w-4 h-4 mr-2" />
              Find Sources
            </>
          )}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
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