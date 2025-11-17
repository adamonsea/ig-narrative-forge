import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

interface KeywordSuggestion {
  keyword: string;
  source: 'universal' | 'proven' | 'localized' | 'landmark' | 'organization';
  confidence: number;
  rationale: string;
}

interface RegionalKeywordAutoPopulateProps {
  topicId: string;
  topicName: string;
  region: string;
  currentKeywords: string[];
  onKeywordsUpdated: () => void;
}

export function RegionalKeywordAutoPopulate({
  topicId,
  topicName,
  region,
  currentKeywords,
  onKeywordsUpdated,
}: RegionalKeywordAutoPopulateProps) {
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-populate-regional-keywords', {
        body: { topicId }
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      toast.success(`Generated ${data.suggestions?.length || 0} keyword suggestions for ${region}`);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate keyword suggestions');
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyword = (keyword: string) => {
    const newSelected = new Set(selectedKeywords);
    if (newSelected.has(keyword)) {
      newSelected.delete(keyword);
    } else {
      newSelected.add(keyword);
    }
    setSelectedKeywords(newSelected);
  };

  const selectAll = () => {
    setSelectedKeywords(new Set(suggestions.map(s => s.keyword)));
  };

  const deselectAll = () => {
    setSelectedKeywords(new Set());
  };

  const addSelectedKeywords = async () => {
    if (selectedKeywords.size === 0) return;

    setAdding(true);
    try {
      const newKeywords = [...currentKeywords, ...Array.from(selectedKeywords)];
      
      const { error } = await supabase.functions.invoke('update-topic-keywords', {
        body: {
          topicId,
          keywords: newKeywords
        }
      });

      if (error) throw error;

      toast.success(`Added ${selectedKeywords.size} keywords to ${topicName}`);
      setSuggestions(suggestions.filter(s => !selectedKeywords.has(s.keyword)));
      setSelectedKeywords(new Set());
      onKeywordsUpdated();
    } catch (error) {
      console.error('Error adding keywords:', error);
      toast.error('Failed to add keywords');
    } finally {
      setAdding(false);
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'universal': return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'proven': return 'bg-green-500/10 text-green-700 dark:text-green-300';
      case 'localized': return 'bg-purple-500/10 text-purple-700 dark:text-purple-300';
      case 'landmark': return 'bg-orange-500/10 text-orange-700 dark:text-orange-300';
      case 'organization': return 'bg-pink-500/10 text-pink-700 dark:text-pink-300';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Auto-Populate Regional Keywords
            </CardTitle>
            <CardDescription>
              Intelligent keyword suggestions based on proven patterns from successful regional feeds
            </CardDescription>
          </div>
          <Button
            onClick={generateSuggestions}
            disabled={loading}
            variant="outline"
          >
            {loading ? 'Generating...' : 'Generate Suggestions'}
          </Button>
        </div>
      </CardHeader>

      {suggestions.length > 0 && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedKeywords.size} of {suggestions.length} selected
            </p>
            <div className="flex gap-2">
              <Button
                onClick={selectAll}
                variant="ghost"
                size="sm"
              >
                Select All
              </Button>
              <Button
                onClick={deselectAll}
                variant="ghost"
                size="sm"
              >
                Deselect All
              </Button>
              <Button
                onClick={addSelectedKeywords}
                disabled={selectedKeywords.size === 0 || adding}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Selected ({selectedKeywords.size})
              </Button>
            </div>
          </div>

          <div className="grid gap-2 max-h-[400px] overflow-y-auto">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.keyword}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => toggleKeyword(suggestion.keyword)}
              >
                <Checkbox
                  checked={selectedKeywords.has(suggestion.keyword)}
                  onCheckedChange={() => toggleKeyword(suggestion.keyword)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{suggestion.keyword}</span>
                    <Badge 
                      variant="secondary" 
                      className={getSourceColor(suggestion.source)}
                    >
                      {suggestion.source}
                    </Badge>
                    <Badge variant="outline">
                      {suggestion.confidence}% confidence
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {suggestion.rationale}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
