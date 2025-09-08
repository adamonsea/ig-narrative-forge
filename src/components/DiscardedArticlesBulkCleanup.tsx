import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2, AlertTriangle } from 'lucide-react';

interface BulkCleanupProps {
  topicId: string;
  onCleanupComplete?: () => void;
}

export const DiscardedArticlesBulkCleanup: React.FC<BulkCleanupProps> = ({
  topicId,
  onCleanupComplete
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [domains, setDomains] = useState('');
  const [minSimilarity, setMinSimilarity] = useState(85);
  const [stats, setStats] = useState<{
    duplicatesFound: number;
    cleaned: number;
  } | null>(null);

  const { toast } = useToast();

  const performBulkCleanup = async () => {
    if (!keywords.trim() && !domains.trim()) {
      toast({
        title: "Input Required",
        description: "Please provide keywords or domains to clean up",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setStats(null);

    try {
      // Find articles matching cleanup criteria
      let query = supabase
        .from('articles')
        .select('id, title, source_url, originality_confidence')
        .eq('topic_id', topicId)
        .neq('processing_status', 'discarded');

      // Apply filters
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
      const domainList = domains.split(',').map(d => d.trim()).filter(d => d);

      let articlesToProcess = [];

      if (keywordList.length > 0 || domainList.length > 0) {
        const { data: articles, error } = await query;
        
        if (error) throw error;

        articlesToProcess = articles?.filter(article => {
          // Check keywords
          if (keywordList.length > 0) {
            const titleMatch = keywordList.some(keyword => 
              article.title?.toLowerCase().includes(keyword.toLowerCase())
            );
            if (titleMatch) return true;
          }

          // Check domains
          if (domainList.length > 0) {
            try {
              const domain = new URL(article.source_url).hostname;
              const domainMatch = domainList.some(targetDomain => 
                domain.includes(targetDomain.toLowerCase())
              );
              if (domainMatch) return true;
            } catch (e) {
              // Invalid URL, skip domain check
            }
          }

          // Check originality confidence
          if (article.originality_confidence && article.originality_confidence < minSimilarity) {
            return true;
          }

          return false;
        }) || [];
      }

      let cleaned = 0;

      // Bulk discard matching articles
      for (const article of articlesToProcess) {
        try {
          // Call the mark-article-discarded function
          const { error: discardError } = await supabase.functions.invoke('mark-article-discarded', {
            body: { articleId: article.id }
          });

          if (discardError) {
            console.warn(`Failed to discard article ${article.id}: ${discardError.message}`);
          } else {
            cleaned++;
          }
        } catch (error) {
          console.warn(`Error discarding article ${article.id}:`, error);
        }
      }

      setStats({
        duplicatesFound: articlesToProcess.length,
        cleaned
      });

      toast({
        title: "Bulk Cleanup Complete",
        description: `Found ${articlesToProcess.length} suspicious articles, discarded ${cleaned}`,
      });

      onCleanupComplete?.();

    } catch (error) {
      console.error('Bulk cleanup error:', error);
      toast({
        title: "Cleanup Failed",
        description: `Error during cleanup: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Bulk Duplicate Cleanup
        </CardTitle>
        <CardDescription>
          Remove articles matching specific patterns or with low originality scores
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="keywords">Keywords (comma-separated)</Label>
          <Textarea
            id="keywords"
            placeholder="spam, advertisement, promotion, breaking news"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="domains">Domains to Clean (comma-separated)</Label>
          <Input
            id="domains"
            placeholder="spamsite.com, lowquality.net"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="similarity">Minimum Originality Confidence (%)</Label>
          <Input
            id="similarity"
            type="number"
            min="0"
            max="100"
            value={minSimilarity}
            onChange={(e) => setMinSimilarity(parseInt(e.target.value) || 85)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Articles below this confidence score will be considered for cleanup
          </p>
        </div>

        {stats && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Cleanup Results</span>
            </div>
            <p className="text-sm">
              Found {stats.duplicatesFound} suspicious articles, successfully discarded {stats.cleaned}
            </p>
          </div>
        )}

        <Button
          onClick={performBulkCleanup}
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing ? "Processing..." : "Run Bulk Cleanup"}
        </Button>
      </CardContent>
    </Card>
  );
};