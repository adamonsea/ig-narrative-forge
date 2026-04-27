import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TopicNegativeKeywordsProps {
  topicId: string;
  negativeKeywords: string[];
  onUpdate: (keywords: string[]) => void;
}

interface PurgeMatch {
  story_id: string;
  title: string;
  matched_keyword: string;
  field: 'title' | 'body';
  created_at: string;
}

export const TopicNegativeKeywords: React.FC<TopicNegativeKeywordsProps> = ({
  topicId,
  negativeKeywords,
  onUpdate
}) => {
  const [newKeyword, setNewKeyword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeMatches, setPurgeMatches] = useState<PurgeMatch[] | null>(null);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
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

  const runPurgeScan = async (execute: boolean) => {
    if (execute) setIsPurging(true); else setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'purge-negative-keyword-stories',
        { body: { topicId, dryRun: !execute } }
      );
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Purge failed');

      if (execute) {
        toast({
          title: 'Stories purged',
          description: `Removed ${data.purged} matching ${data.purged === 1 ? 'story' : 'stories'} from this topic.`,
        });
        setPurgeMatches(null);
        setShowPurgeDialog(false);
      } else {
        setPurgeMatches(data.matches || []);
        setShowPurgeDialog(true);
      }
    } catch (error) {
      console.error('Purge error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to scan for matching stories.',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
      setIsPurging(false);
    }
  };

  return (
    <>
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

        {negativeKeywords.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              These rules apply going forward. To remove existing stories that already match, run a one-time cleanup:
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runPurgeScan(false)}
              disabled={isScanning || isPurging}
              className="gap-2"
            >
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {isScanning ? 'Scanning…' : 'Find & remove existing matches'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {purgeMatches && purgeMatches.length > 0
              ? `Remove ${purgeMatches.length} matching ${purgeMatches.length === 1 ? 'story' : 'stories'}?`
              : 'No matches found'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {purgeMatches && purgeMatches.length > 0 ? (
                <>
                  <p className="text-sm">
                    These stories already in your feed contain a negative keyword.
                    Removing them is permanent and they will be suppressed from future scrapes.
                  </p>
                  <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                    {purgeMatches.map((m) => (
                      <div key={m.story_id} className="p-2 text-sm">
                        <div className="font-medium text-foreground line-clamp-1">{m.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Matched <Badge variant="destructive" className="text-[10px] py-0 px-1.5 mx-1">{m.matched_keyword}</Badge>
                          in {m.field}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm">
                  Your existing feed does not contain any stories matching the current negative keywords.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPurging}>Cancel</AlertDialogCancel>
          {purgeMatches && purgeMatches.length > 0 && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runPurgeScan(true);
              }}
              disabled={isPurging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPurging ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Removing…</>
              ) : (
                <>Remove {purgeMatches.length} {purgeMatches.length === 1 ? 'story' : 'stories'}</>
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};