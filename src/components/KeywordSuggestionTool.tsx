import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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

  const getSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-keywords', {
        body: {
          topicName,
          description,
          keywords,
          topicType,
          region
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        setSuggestions(data.suggestions);
        toast.success(`Found ${data.suggestions.length} relevant keywords`);
      } else {
        throw new Error(data.error || 'Failed to find keywords');
      }
    } catch (error) {
      console.error('Error finding keywords:', error);
      toast.error('Failed to find keywords. Please try again.');
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
      toast.success(`Added keyword: "${keyword}"`);
      
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
        <h3 className="text-sm font-medium">Find Keywords</h3>
        <Button 
          onClick={getSuggestions} 
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finding...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Find Keywords
            </>
          )}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{suggestion.keyword}</span>
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                    >
                      {Math.round(suggestion.confidence_score * 100)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.rationale}
                  </p>
                </div>
                
                <Button
                  onClick={() => addKeyword(suggestion.keyword)}
                  disabled={addingKeyword === suggestion.keyword}
                  size="sm"
                  variant="ghost"
                  className="ml-3 h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground"
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
    </div>
  );
}