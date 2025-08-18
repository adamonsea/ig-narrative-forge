import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2, 
  X, 
  Clock, 
  AlertTriangle, 
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  body: string;
  author: string | null;
  published_at: string | null;
  source_url: string;
  region: string | null;
  word_count: number | null;
  import_metadata: any;
  created_at: string;
}

interface ArticleQueueProps {
  onRefresh?: () => void;
}

export const ArticleQueue = ({ onRefresh }: ArticleQueueProps) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPendingArticles();
  }, []);

  const loadPendingArticles = async () => {
    try {
      setLoading(true);
      
      // Get articles that haven't been processed into slides yet and aren't rejected
      const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (articlesError) throw articlesError;

      // Filter out articles that already have stories or are rejected
      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select('article_id');

      if (storiesError) throw storiesError;

      const processedArticleIds = new Set(stories?.map(s => s.article_id) || []);
      const pendingArticles = articles?.filter(article => 
        !processedArticleIds.has(article.id) && 
        !(article.import_metadata as any)?.rejected
      ) || [];

      // Detect and sort reviews to bottom
      const isReview = (article: Article) => {
        const title = article.title.toLowerCase();
        const body = article.body?.toLowerCase() || '';
        
        return title.includes('review') || 
               title.includes('theatre') || 
               title.includes('theater') ||
               title.includes('film') ||
               title.includes('movie') ||
               title.includes('cinema') ||
               title.includes('play') ||
               title.includes('performance') ||
               body.includes('stars out of') ||
               body.includes('rating:') ||
               body.includes('★') ||
               /\d\/\d+/.test(title); // patterns like "4/5"
      };

      // Sort articles: non-reviews first (by relevance), then reviews at bottom
      const sortedArticles = pendingArticles.sort((a, b) => {
        const aIsReview = isReview(a);
        const bIsReview = isReview(b);
        
        // If one is review and other isn't, non-review goes first
        if (aIsReview && !bIsReview) return 1;
        if (!aIsReview && bIsReview) return -1;
        
        // Both same type, sort by relevance score (higher first)
        const aScore = (a.import_metadata as any)?.eastbourne_relevance_score || 0;
        const bScore = (b.import_metadata as any)?.eastbourne_relevance_score || 0;
        return bScore - aScore;
      });

      setArticles(sortedArticles);
    } catch (error: any) {
      console.error('Error loading articles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load article queue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const approveArticle = async (article: Article, slideType: 'short' | 'tabloid' | 'indepth' = 'tabloid') => {
    try {
      setProcessingArticle(article.id);

      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { 
          articleId: article.id,
          slideType: slideType
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Content generation failed');
      }

      const typeLabels = {
        short: 'Short Carousel',
        tabloid: 'Tabloid Style',
        indepth: 'In-Depth Analysis'
      };

      toast({
        title: 'Article Approved!',
        description: `Generated ${data.slideCount} slides (${typeLabels[slideType]}) for "${article.title}"`,
      });

      // Remove from queue and refresh
      await loadPendingArticles();
      onRefresh?.();

    } catch (error: any) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate slides',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const rejectArticle = async (articleId: string) => {
    try {
      // Get current metadata and merge with rejection flag
      const { data: currentArticle, error: fetchError } = await supabase
        .from('articles')
        .select('import_metadata')
        .eq('id', articleId)
        .single();

      if (fetchError) throw fetchError;

      const currentMetadata = (currentArticle?.import_metadata as any) || {};
      
      // Mark as rejected by adding a flag to import_metadata
      const { error } = await supabase
        .from('articles')
        .update({
          import_metadata: { 
            ...currentMetadata,
            rejected: true, 
            rejected_at: new Date().toISOString() 
          }
        })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Article Rejected',
        description: 'Article removed from queue',
      });

      // Immediately remove from local state for instant UI update
      setArticles(articles.filter(article => article.id !== articleId));
      
    } catch (error: any) {
      console.error('Error rejecting article:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject article',
        variant: 'destructive',
      });
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 15) return 'bg-green-500';
    if (score >= 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Article Validation Queue
          </CardTitle>
          <CardDescription>
            Review and approve articles for slide generation. Articles are archived after processing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No articles pending review</p>
              <p className="text-sm">New articles will appear here for validation</p>
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => {
                const relevanceScore = (article.import_metadata as any)?.eastbourne_relevance_score || 0;
                const isProcessing = processingArticle === article.id;
                const isReview = article.title.toLowerCase().includes('review') || 
                               article.title.toLowerCase().includes('theatre') ||
                               article.title.toLowerCase().includes('film');
                
                return (
                  <div key={article.id} className={`p-4 border rounded-lg space-y-3 ${isReview ? 'bg-yellow-50 border-yellow-200' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium line-clamp-2">{article.title}</h3>
                          <div className="flex items-center gap-1">
                            <div 
                              className={`w-2 h-2 rounded-full ${getRelevanceColor(relevanceScore)}`}
                              title={`Relevance Score: ${relevanceScore}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {relevanceScore}
                            </span>
                          </div>
                          {isReview && (
                            <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">
                              Review
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {article.author && <span>{article.author}</span>}
                          {article.region && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">{article.region}</Badge>
                            </>
                          )}
                          {article.word_count && (
                            <>
                              <span>•</span>
                              <span>{article.word_count} words</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{new Date(article.created_at).toLocaleDateString()}</span>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {article.body?.substring(0, 200)}...
                        </p>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(article.source_url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectArticle(article.id)}
                          disabled={isProcessing}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => approveArticle(article, 'short')}
                            disabled={isProcessing}
                            className="h-7 px-2 text-xs"
                            variant="default"
                          >
                            {isProcessing ? (
                              <div className="animate-spin rounded-full h-2 w-2 border-b border-white mr-1" />
                            ) : (
                              <Sparkles className="w-2 h-2 mr-1" />
                            )}
                            Short (4)
                          </Button>
                          
                          <Button
                            size="sm"
                            onClick={() => approveArticle(article, 'tabloid')}
                            disabled={isProcessing}
                            className="h-7 px-2 text-xs"
                            variant="secondary"
                          >
                            {isProcessing ? (
                              <div className="animate-spin rounded-full h-2 w-2 border-b border-current mr-1" />
                            ) : (
                              <Sparkles className="w-2 h-2 mr-1" />
                            )}
                            Tabloid (8)
                          </Button>
                          
                          <Button
                            size="sm"
                            onClick={() => approveArticle(article, 'indepth')}
                            disabled={isProcessing}
                            className="h-7 px-2 text-xs"
                            variant="outline"
                          >
                            {isProcessing ? (
                              <div className="animate-spin rounded-full h-2 w-2 border-b border-current mr-1" />
                            ) : (
                              <Sparkles className="w-2 h-2 mr-1" />
                            )}
                            In-Depth (10+)
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};