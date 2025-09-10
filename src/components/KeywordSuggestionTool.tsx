import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, History, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSuggestionMemory, KeywordSuggestionMemory } from '@/hooks/useSuggestionMemory';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface KeywordSuggestion {
  keyword: string;
  confidence_score: number;
  rationale: string;
}

interface KeywordSuggestionToolProps {
  topicName: string;
  description?: string;
  keywords?: string[];
  topicType: string;
  region?: string;
  onKeywordAdd: (keyword: string) => void;
  existingKeywords: string[];
}

export function KeywordSuggestionTool({
  topicName,
  description,
  keywords = [],
  topicType,
  region,
  onKeywordAdd,
  existingKeywords
}: KeywordSuggestionToolProps) {
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const memoryKey = `keywords-${topicName}-${topicType}${region ? '-' + region : ''}`;
  const suggestionMemory = useSuggestionMemory<KeywordSuggestionMemory>(memoryKey);
  const stats = suggestionMemory.getStats();

  const getSuggestions = async () => {
    setLoading(true);
    try {
      // Get published stories and their keywords for learning context
      const { data: publishedStories } = await supabase
        .from('articles')
        .select('title, body, keywords')
        .eq('processing_status', 'processed')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data, error } = await supabase.functions.invoke('suggest-keywords', {
        body: {
          topicName,
          description,
          keywords,
          topicType,
          region,
          existingKeywords,
          publishedStories: publishedStories || []
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        const allSuggestions = data.suggestions;
        const newSuggestions = suggestionMemory.filterNewSuggestions(allSuggestions) as KeywordSuggestion[];
        
        setSuggestions(newSuggestions);
        
        // Add to memory
        const memoryItems = allSuggestions.map((s: KeywordSuggestion) => ({
          keyword: s.keyword,
          confidence_score: s.confidence_score,
          rationale: s.rationale
        }));
        suggestionMemory.addSuggestions(memoryItems);
        
        if (newSuggestions.length > 0) {
          toast.success(`Found ${newSuggestions.length} new keywords${allSuggestions.length > newSuggestions.length ? ` (${allSuggestions.length - newSuggestions.length} already seen)` : ''}`);
        } else if (allSuggestions.length > 0) {
          toast.info(`All ${allSuggestions.length} suggested keywords were previously shown. Check history to see them again.`);
        } else {
          toast.info('No new keywords found for this topic');
        }
      } else {
        throw new Error(data.error || 'Failed to find keywords');
      }
    } catch (error) {
      console.error('Error finding keywords:', error);
      toast.error('Having trouble connecting to keyword discovery service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addKeyword = async (keyword: string) => {
    // Check if keyword already exists (case insensitive)
    const normalizedKeyword = keyword.toLowerCase().trim();
    const normalizedExisting = existingKeywords.map(k => k.toLowerCase().trim());
    
    if (normalizedExisting.includes(normalizedKeyword)) {
      toast.info('This keyword is already added');
      return;
    }

    setAddingKeyword(keyword);
    try {
      // Trigger keyword addition notification  
      onKeywordAdd(keyword);
      toast.success(`✅ Added keyword: "${keyword}"`);
      
      // Mark as added in memory
      const memoryItem = suggestionMemory.memory.find(item => item.keyword === keyword);
      if (memoryItem) {
        suggestionMemory.markAsAdded(memoryItem.id);
      }
      
      // Trigger parent refresh to show new keyword in list
      window.dispatchEvent(new CustomEvent('keywordAdded'));
      
      // Remove the added suggestion from the list
      setSuggestions(prev => prev.filter(s => s.keyword !== keyword));
    } catch (error) {
      console.error('Error adding keyword:', error);
      toast.error('Failed to add keyword');
    } finally {
      setAddingKeyword(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Find Keywords</h3>
          {stats.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.added} added, {stats.pending} pending, {stats.total} total discovered
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {stats.total > 0 && (
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant="ghost"
              size="sm"
            >
              <History className="mr-2 h-4 w-4" />
              History ({stats.total})
            </Button>
          )}
          <Button 
            onClick={getSuggestions} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Discover Keywords
              </>
            )}
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="grid gap-2">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="relative group rounded-lg border bg-card hover:bg-accent/50 transition-colors overflow-hidden"
              >
                <div 
                  className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 pr-12 cursor-pointer"
                  onClick={() => addKeyword(suggestion.keyword)}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-foreground break-words">
                        {suggestion.keyword}
                      </span>
                      <Badge 
                        variant="secondary" 
                        className="text-xs shrink-0"
                      >
                        {Math.round(suggestion.confidence_score * 100)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed break-words">
                      {suggestion.rationale}
                    </p>
                  </div>
                </div>
                
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    addKeyword(suggestion.keyword);
                  }}
                  disabled={addingKeyword === suggestion.keyword}
                  size="sm"
                  variant="ghost"
                  className="absolute top-3 right-3 h-8 w-8 p-0 shrink-0 hover:bg-primary hover:text-primary-foreground group-hover:bg-primary/10"
                >
                  {addingKeyword === suggestion.keyword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total > 0 && (
        <Collapsible open={showHistory} onOpenChange={setShowHistory}>
          <CollapsibleContent className="space-y-2">
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Previously Discovered Keywords</span>
              </div>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {suggestionMemory.getPreviouslySeen().map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded border text-xs ${
                      item.added ? 'bg-green-50 border-green-200 dark:bg-green-950/20' :
                      item.rejected ? 'bg-red-50 border-red-200 dark:bg-red-950/20' :
                      'bg-background border-border'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.keyword}</span>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(item.confidence_score * 100)}%
                        </Badge>
                        {item.added && <Badge variant="default" className="text-xs bg-green-100 text-green-800">Added</Badge>}
                        {item.rejected && <Badge variant="destructive" className="text-xs">Rejected</Badge>}
                      </div>
                      <p className="text-muted-foreground truncate mt-1">{item.rationale}</p>
                    </div>
                    {!item.added && !item.rejected && (
                      <Button
                        onClick={() => {
                          // Re-add to current suggestions if not already there
                          if (!suggestions.some(s => s.keyword === item.keyword)) {
                            setSuggestions(prev => [...prev, {
                              keyword: item.keyword,
                              confidence_score: item.confidence_score,
                              rationale: item.rationale
                            }]);
                          }
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}