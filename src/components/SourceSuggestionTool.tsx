import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Plus, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SourceQualityGuide } from './SourceQualityGuide';

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
  const [manualUrl, setManualUrl] = useState('');
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
    
    // Check if source already exists for this topic directly
    const { data: existingSource } = await supabase
      .from('content_sources')
      .select('id, source_name, feed_url')
      .eq('topic_id', topicId)
      .or(`feed_url.eq.${suggestion.url},canonical_domain.eq.${domain}`)
      .maybeSingle();

    if (existingSource) {
      return {
        exists: true,
        id: existingSource.id
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

          // Check if the system discovered a better RSS feed
          let feedUrl = suggestion.url;
          if (validationResult?.suggestedUrl) {
            feedUrl = validationResult.suggestedUrl;
            toast({
              title: "RSS Feed Auto-Discovered",
              description: `Found working RSS feed for ${suggestion.source_name}: ${feedUrl}`,
            });
          }

          // Show informative feedback based on validation results
          if (validationResult?.warnings?.length > 0) {
            const warningCount = validationResult.warnings.length;
            const hasAutoFix = validationResult.suggestedUrl ? ' (auto-fixed RSS URL)' : '';
            toast({
              title: "Source Added with Notes",
              description: `${suggestion.source_name} added successfully${hasAutoFix} (${warningCount} validation notes)`,
            });
          } else {
            toast({
              title: "Source Validated Successfully",
              description: `${suggestion.source_name} passed all validation checks`,
            });
          }

          // Update the URL if we discovered a better one
          if (validationResult?.suggestedUrl) {
            suggestion.url = validationResult.suggestedUrl;
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
      
      // Create source directly with topic_id
      // Note: suggestion.url may have been updated to auto-discovered RSS feed during validation
      const { data: newSource, error: createError } = await supabase
        .from('content_sources')
        .insert({
          source_name: suggestion.source_name,
          feed_url: suggestion.url, // This might be the auto-discovered RSS URL
          canonical_domain: domain,
          content_type: 'news',
          credibility_score: Math.round(suggestion.confidence_score * 0.8),
          is_active: true,
          source_type: suggestion.type === 'RSS' ? 'rss' : 'website',
          region: topicType === 'regional' ? region : null,
          topic_id: topicId
        })
        .select('id')
        .single();

      if (createError) {
        if (createError.code === '23505') {
          toast({
            title: "Source Already Added",
            description: "This source is already active for this topic",
            variant: "destructive"
          });
        } else {
          throw createError;
        }
      } else {
        toast({
          title: "Source Added Successfully",
          description: `${suggestion.source_name} added to topic successfully`,
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

  const handleAddManualSource = async () => {
    if (!manualUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive"
      });
      return;
    }

    // Create a manual suggestion and add it
    const domain = new URL(manualUrl).hostname.replace('www.', '');
    const manualSuggestion: SourceSuggestion = {
      url: manualUrl,
      source_name: domain,
      type: manualUrl.includes('/feed') || manualUrl.includes('/rss') ? 'RSS' : 'News',
      confidence_score: 70,
      rationale: 'Manually added source'
    };

    await addSource(manualSuggestion);
    setManualUrl('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Find Sources</h3>
          <SourceQualityGuide currentUrl={manualUrl} />
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
              <Search className="w-4 h-4 mr-2" />
              Discover Sources
            </>
          )}
        </Button>
      </div>

      {/* Manual URL input */}
      <div className="flex gap-2">
        <Input
          placeholder="Or paste a website/RSS URL directly..."
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          className="text-sm"
        />
        <Button
          onClick={handleAddManualSource}
          disabled={!manualUrl.trim() || loading}
          size="sm"
          variant="ghost"
        >
          <Plus className="w-4 h-4" />
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{suggestion.url}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </div>
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