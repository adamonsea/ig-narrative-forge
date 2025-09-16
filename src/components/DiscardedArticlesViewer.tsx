import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ExternalLink, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DiscardedArticle {
  id: string;
  title: string;
  regional_relevance_score: number;
  content_quality_score: number;
  rejection_reason: string;
  source_url: string;
  created_at: string;
  source_name?: string;
}

interface DiscardedArticlesViewerProps {
  topicId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DiscardedArticlesViewer = ({ topicId, isOpen, onClose }: DiscardedArticlesViewerProps) => {
  const [articles, setArticles] = useState<DiscardedArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    regional_relevance: 0,
    content_quality: 0,
    other: 0
  });
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && topicId) {
      loadDiscardedArticles();
    }
  }, [isOpen, topicId]);

  const loadDiscardedArticles = async () => {
    try {
      setLoading(true);
      
      // Get discarded articles from multi-tenant system
      const { data: articlesData, error: articlesError } = await supabase
        .from('topic_articles')
        .select(`
          id,
          regional_relevance_score,
          content_quality_score,
          import_metadata,
          created_at,
          shared_content:shared_article_content!inner(
            title,
            url
          ),
          content_sources!left(source_name)
        `)
        .eq('topic_id', topicId)
        .eq('processing_status', 'discarded')
        .order('created_at', { ascending: false })
        .limit(50);

      if (articlesError) throw articlesError;

      const processedArticles = (articlesData || []).map(article => ({
        id: article.id,
        title: article.shared_content?.title || 'Unknown Title',
        regional_relevance_score: article.regional_relevance_score || 0,
        content_quality_score: article.content_quality_score || 0,
        rejection_reason: (article.import_metadata as any)?.rejection_reason || 'unknown',
        source_url: article.shared_content?.url || '',
        created_at: article.created_at,
        source_name: article.content_sources?.source_name || 'Unknown Source'
      }));

      setArticles(processedArticles);

      // Calculate stats
      const totalCount = processedArticles.length;
      const regionalCount = processedArticles.filter(a => a.rejection_reason === 'insufficient_regional_relevance').length;
      const qualityCount = processedArticles.filter(a => a.rejection_reason === 'insufficient_content_quality').length;
      const otherCount = totalCount - regionalCount - qualityCount;

      setStats({
        total: totalCount,
        regional_relevance: regionalCount,
        content_quality: qualityCount,
        other: otherCount
      });

    } catch (error) {
      console.error('Error loading discarded articles:', error);
      toast({
        title: "Error",
        description: "Failed to load discarded articles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreArticle = async (articleId: string, articleTitle: string) => {
    try {
      const { error } = await supabase
        .from('topic_articles')
        .update({ 
          processing_status: 'new',
          updated_at: new Date().toISOString()
        })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: "Article Restored",
        description: `"${articleTitle}" has been restored to the pipeline and will appear in Arrivals`
      });

      // Refresh the list
      loadDiscardedArticles();
    } catch (error) {
      console.error('Error restoring article:', error);
      toast({
        title: "Restore Failed",
        description: "Failed to restore article",
        variant: "destructive"
      });
    }
  };

  if (!isOpen) return null;

  const getRejectionBadgeVariant = (reason: string) => {
    switch (reason) {
      case 'insufficient_regional_relevance':
        return 'destructive';
      case 'insufficient_content_quality':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatRejectionReason = (reason: string) => {
    switch (reason) {
      case 'insufficient_regional_relevance':
        return 'Low Regional Relevance';
      case 'insufficient_content_quality':
        return 'Low Content Quality';
      default:
        return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Filtered Articles</CardTitle>
            <CardDescription>
              Articles that were discarded during content gathering - you can restore relevant ones
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Filtered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{stats.regional_relevance}</div>
              <div className="text-sm text-muted-foreground">Regional Relevance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary-foreground">{stats.content_quality}</div>
              <div className="text-sm text-muted-foreground">Content Quality</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.other}</div>
              <div className="text-sm text-muted-foreground">Other</div>
            </div>
          </div>

          {/* Articles List */}
          <div className="max-h-96 overflow-y-auto space-y-3">
            {loading ? (
              <div className="text-center py-8">Loading filtered articles...</div>
            ) : articles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No filtered articles found for this topic
              </div>
            ) : (
              articles.map((article) => (
                <div key={article.id} className="border rounded-lg p-4 hover:bg-muted/25">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{article.title}</h4>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <span>Regional: {article.regional_relevance_score}%</span>
                        <span>•</span>
                        <span>Quality: {article.content_quality_score}%</span>
                        <span>•</span>
                        <span>{article.source_name}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={getRejectionBadgeVariant(article.rejection_reason)}>
                        {formatRejectionReason(article.rejection_reason)}
                      </Badge>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(article.source_url, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestoreArticle(article.id, article.title)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};