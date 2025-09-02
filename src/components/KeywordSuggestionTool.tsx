import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Lightbulb } from 'lucide-react';
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
        toast.success(`Found ${data.suggestions.length} keyword suggestions`);
      } else {
        throw new Error(data.error || 'Failed to get keyword suggestions');
      }
    } catch (error) {
      console.error('Error getting keyword suggestions:', error);
      toast.error('Failed to get keyword suggestions. Please try again.');
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
      onKeywordAdd(keyword);
      toast.success(`Added keyword: "${keyword}"`);
      
      // Remove the added suggestion from the list
      setSuggestions(prev => prev.filter(s => s.keyword !== keyword));
    } catch (error) {
      console.error('Error adding keyword:', error);
      toast.error('Failed to add keyword');
    } finally {
      setAddingKeyword(null);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (score >= 0.6) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <Card className="border-dashed border-2 border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          AI Keyword Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <Button 
            onClick={getSuggestions} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Getting suggestions...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-4 w-4" />
                Get AI keyword suggestions
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {suggestions.length} keyword suggestions
              </p>
              <Button 
                onClick={getSuggestions} 
                disabled={loading}
                variant="ghost"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Refresh'
                )}
              </Button>
            </div>
            
            <div className="grid gap-2">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{suggestion.keyword}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getConfidenceColor(suggestion.confidence_score)}`}
                      >
                        {getConfidenceLabel(suggestion.confidence_score)} ({Math.round(suggestion.confidence_score * 100)}%)
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
                    variant="outline"
                    className="ml-2 shrink-0"
                  >
                    {addingKeyword === suggestion.keyword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
            
            {suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                All suggested keywords have been added! Click refresh to get more suggestions.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}