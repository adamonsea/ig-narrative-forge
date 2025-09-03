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

  const checkExistingSource = async (suggestion: SourceSuggestion): Promise<{exists: boolean, id?: string, assignedToTopic?: boolean}> => {
    const domain = new URL(suggestion.url).hostname.replace('www.', '');
    
    // Check if source exists globally by name or domain
    const { data: existingSources } = await supabase
      .from('content_sources')
      .select('id, source_name, topic_id, canonical_domain')
      .or(`source_name.eq.${suggestion.source_name},canonical_domain.eq.${domain}`);

    if (existingSources && existingSources.length > 0) {
      const matchingSource = existingSources[0];
      return {
        exists: true,
        id: matchingSource.id,
        assignedToTopic: matchingSource.topic_id === topicId
      };
    }
    
    return { exists: false };
  };

  const assignExistingSource = async (sourceId: string, suggestion: SourceSuggestion) => {
    try {
      const { error } = await supabase
        .from('content_sources')
        .update({ topic_id: topicId })
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Source Assigned",
        description: `${suggestion.source_name} has been assigned to this topic`,
      });
      
      // Remove from suggestions after assigning
      setSuggestions(suggestions.filter(s => s.url !== suggestion.url));
      
      // Trigger parent refresh to show source in list
      window.dispatchEvent(new CustomEvent('sourceAdded'));
    } catch (error) {
      console.error('Error assigning source:', error);
      toast({
        title: "Error",
        description: "Failed to assign existing source",
        variant: "destructive"
      });
    }
  };

  const addSource = async (suggestion: SourceSuggestion, skipValidation = false) => {
    const sourceKey = suggestion.url;
    setAddingSourceId(sourceKey);
    
    try {
      // First check if source already exists
      const existingCheck = await checkExistingSource(suggestion);
      
      if (existingCheck.exists) {
        if (existingCheck.assignedToTopic) {
          toast({
            title: "Source Already Added",
            description: "This source is already assigned to this topic",
            variant: "destructive"
          });
          setAddingSourceId(null);
          return;
        } else {
          // Offer to assign existing source to this topic
          if (confirm(`This source already exists. Would you like to assign it to "${topicName}"?`)) {
            await assignExistingSource(existingCheck.id!, suggestion);
          }
          setAddingSourceId(null);
          return;
        }
      }

      // Simplified server-side validation for new sources (unless skipped)
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

          // If validation completely fails, add anyway with warning
          if (validationError) {
            console.warn('Source validation failed, adding anyway:', validationError.message);
            toast({
              title: "Added with Validation Warning", 
              description: `Source added but validation failed: ${validationError.message.substring(0, 80)}...`,
              variant: "default"
            });
          } else if (validationResult && !validationResult.success) {
            // Show validation issues but continue adding
            const errorMsg = validationResult?.error || 'Source validation issues detected';
            const warnings = validationResult?.warnings || [];
            
            console.warn('Source validation issues:', { error: errorMsg, warnings });
            toast({
              title: "Source Added with Issues",
              description: `Added successfully but with ${warnings.length} validation warnings - may need monitoring`,
              variant: "default"
            });
          } else if (validationResult?.warnings?.length > 0) {
            // Minor warnings only
            toast({
              title: "Source Added Successfully",
              description: `Added with ${validationResult.warnings.length} minor warnings`,
              variant: "default"
            });
          }
        } catch (error) {
          // Validation service failed completely, but still add the source
          console.error('Validation service failed:', error);
          toast({
            title: "Added Without Validation",
            description: "Source added successfully but validation service unavailable",
            variant: "default"
          });
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
        // Enhanced duplicate handling
        if (error.code === '23505') {
          // This shouldn't happen now due to our pre-check, but just in case
          const existingCheck = await checkExistingSource(suggestion);
          if (existingCheck.exists && !existingCheck.assignedToTopic) {
            if (confirm(`This source exists but isn't assigned to "${topicName}". Assign it now?`)) {
              await assignExistingSource(existingCheck.id!, suggestion);
            }
          } else {
            toast({
              title: "Source Already Exists",
              description: "This source is already in your database for this topic",
              variant: "destructive"
            });
          }
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