import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface TopicNegativeKeywordsProps {
  topicId: string;
  negativeKeywords: string[];
  onUpdate: (keywords: string[]) => void;
}

export const TopicNegativeKeywords: React.FC<TopicNegativeKeywordsProps> = ({
  topicId,
  negativeKeywords,
  onUpdate
}) => {
  const [newKeyword, setNewKeyword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const addKeyword = async () => {
    if (!newKeyword.trim()) return;

    const keyword = newKeyword.trim().toLowerCase();
    if (negativeKeywords.includes(keyword)) {
      toast({
        title: "Keyword already exists",
        description: "This negative keyword is already in the list.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    const updatedKeywords = [...negativeKeywords, keyword];

    try {
      const { error } = await supabase
        .from('topics')
        .update({ negative_keywords: updatedKeywords })
        .eq('id', topicId);

      if (error) throw error;

      onUpdate(updatedKeywords);
      setNewKeyword('');
      toast({
        title: "Negative keyword added",
        description: "Articles containing this keyword will be automatically rejected.",
      });
    } catch (error) {
      console.error('Error adding negative keyword:', error);
      toast({
        title: "Error",
        description: "Failed to add negative keyword.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const removeKeyword = async (keywordToRemove: string) => {
    const updatedKeywords = negativeKeywords.filter(k => k !== keywordToRemove);

    try {
      const { error } = await supabase
        .from('topics')
        .update({ negative_keywords: updatedKeywords })
        .eq('id', topicId);

      if (error) throw error;

      onUpdate(updatedKeywords);
      toast({
        title: "Negative keyword removed",
        description: "This keyword will no longer automatically reject articles.",
      });
    } catch (error) {
      console.error('Error removing negative keyword:', error);
      toast({
        title: "Error",
        description: "Failed to remove negative keyword.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          Negative Keywords
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Articles containing these keywords will be automatically rejected and won't appear in your feed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter negative keyword..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
          />
          <Button 
            onClick={addKeyword} 
            disabled={!newKeyword.trim() || isAdding}
            size="sm"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {negativeKeywords.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Current negative keywords:</p>
            <div className="flex flex-wrap gap-2">
              {negativeKeywords.map((keyword) => (
                <Badge 
                  key={keyword} 
                  variant="destructive" 
                  className="gap-1"
                >
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="hover:bg-destructive-foreground/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {negativeKeywords.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No negative keywords defined</p>
            <p className="text-xs">Add keywords to automatically filter out unwanted content</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};