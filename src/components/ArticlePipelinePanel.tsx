import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  ExternalLink,
  Sparkles,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  X,
  FileText,
  Eye
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
  category?: string;
  tags?: string[];
  reading_time_minutes?: number;
  summary?: string;
  source_name?: string;
  source_domain?: string;
  queue_status?: string;
  queue_type?: string;
  queue_id?: string;
  queue_attempts?: number;
  queue_max_attempts?: number;
  queue_error?: string;
  is_stuck?: boolean;
}

interface ArticlePipelinePanelProps {
  onRefresh?: () => void;
}

export const ArticlePipelinePanel = ({ onRefresh }: ArticlePipelinePanelProps) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [queuedArticles, setQueuedArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<string | null>(null);
  const [isResettingStalled, setIsResettingStalled] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadPendingArticles();
    loadQueuedArticles();
  }, []);

  const loadQueuedArticles = async () => {
    try {
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          article_id,
          status,
          slidetype,
          attempts,
          max_attempts,
          error_message,
          created_at
        `)
        .in('status', ['pending', 'processing']);

      if (queueError) throw queueError;

      const queuedIds = queueData?.map(q => q.article_id) || [];
      
      if (queuedIds.length > 0) {
        const { data: articleData, error: articleError } = await supabase
          .from('articles')
          .select(`
            id, title, author, published_at, category, tags, word_count, 
            reading_time_minutes, source_url, region, summary, body, created_at,
            import_metadata
          `)
          .in('id', queuedIds);

        if (articleError) throw articleError;

        const enrichedQueuedArticles = articleData?.map(article => {
          const queueInfo = queueData.find(q => q.article_id === article.id);
          const isStuck = queueInfo && (
            queueInfo.attempts >= queueInfo.max_attempts ||
            (queueInfo.status === 'processing' && 
             new Date(queueInfo.created_at).getTime() < Date.now() - 10 * 60 * 1000)
          );
          
          return {
            ...article,
            queue_status: queueInfo?.status || 'pending',
            queue_type: queueInfo?.slidetype || 'tabloid',
            queue_id: queueInfo?.id,
            queue_attempts: queueInfo?.attempts || 0,
            queue_max_attempts: queueInfo?.max_attempts || 3,
            queue_error: queueInfo?.error_message,
            is_stuck: isStuck
          };
        }).filter(article => 
          !(article.queue_attempts >= article.queue_max_attempts && article.queue_status !== 'processing')
        ) || [];

        setQueuedArticles(enrichedQueuedArticles);
      } else {
        setQueuedArticles([]);
      }
    } catch (error) {
      console.error('Error loading queued articles:', error);
      setQueuedArticles([]);
    }
  };

  const loadPendingArticles = async () => {
    try {
      setLoadingArticles(true);
      
      const { data: existingStories, error: storiesError } = await supabase
        .from('stories')
        .select('article_id');

      if (storiesError) throw storiesError;

      const { data: queuedJobs, error: queueError } = await supabase
        .from('content_generation_queue')
        .select('article_id')
        .in('status', ['pending', 'processing']);

      if (queueError) throw queueError;

      const articlesWithStories = new Set(existingStories?.map(s => s.article_id) || []);
      const articlesQueued = new Set(queuedJobs?.map(j => j.article_id) || []);
      
      const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('processing_status', 'new')
        .order('created_at', { ascending: false })
        .limit(50);

      if (articlesError) throw articlesError;

      const availableArticles = (articles || []).filter(article => 
        !articlesWithStories.has(article.id) && !articlesQueued.has(article.id)
      );

      setArticles(availableArticles);
    } catch (error: any) {
      console.error('Error loading articles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load article queue',
        variant: 'destructive',
      });
    } finally {
      setLoadingArticles(false);
    }
  };

  const approveArticle = async (article: Article, slideType: 'tabloid' = 'tabloid') => {
    try {
      setProcessingArticle(article.id);
      
      const { data: queueJob, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: article.id,
          slidetype: slideType,
          status: 'pending'
        })
        .select()
        .single();

      if (queueError) throw new Error(`Failed to queue job: ${queueError.message}`);

      toast({
        title: 'Generation Queued!',
        description: `Article queued for ${slideType} generation.`,
      });

      loadPendingArticles();
      loadQueuedArticles();
      onRefresh?.();

    } catch (error: any) {
      console.error('Queueing error:', error);
      toast({
        title: 'Queue Failed',
        description: error.message || 'Failed to queue generation',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const rejectArticle = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({
          processing_status: 'discarded'
        })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Article Rejected',
        description: 'Article moved to discarded status',
      });

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

  const deleteArticle = async (articleId: string) => {
    try {
      setDeletingArticle(articleId);
      
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Article Deleted',
        description: 'Article permanently removed from system',
      });

      setArticles(articles.filter(article => article.id !== articleId));
      
    } catch (error: any) {
      console.error('Error deleting article:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete article',
        variant: 'destructive',
      });
    } finally {
      setDeletingArticle(null);
    }
  };

  const handleExtractContent = async (article: Article) => {
    try {
      setProcessingArticle(article.id);
      
      const { data, error } = await supabase.functions.invoke('content-extractor', {
        body: { 
          articleId: article.id,
          sourceUrl: article.source_url 
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Content Extracted Successfully',
          description: `Extracted content from article.`,
        });
        
        loadPendingArticles();
      } else {
        throw new Error(data?.error || 'Content extraction failed');
      }
    } catch (error: any) {
      console.error('Content extraction error:', error);
      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract article content',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const clearStuckJob = async (article: Article) => {
    if (!article.queue_id) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', article.queue_id);

      if (deleteError) throw deleteError;

      toast({
        title: "Stuck Job Cleared",
        description: `Cleared stuck job for "${article.title}"`,
      });
      
      loadQueuedArticles();
      loadPendingArticles();
    } catch (error: any) {
      console.error('Error clearing stuck job:', error);
      toast({
        title: "Clear Failed",
        description: `Failed to clear stuck job: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const cancelQueuedJob = async (article: Article) => {
    if (!article.queue_id) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', article.queue_id);

      if (deleteError) throw deleteError;

      toast({
        title: "Job Cancelled",
        description: `Cancelled generation for "${article.title}"`,
      });
      
      loadQueuedArticles();
      loadPendingArticles();
    } catch (error: any) {
      console.error('Error cancelling job:', error);
      toast({
        title: "Cancel Failed",
        description: `Failed to cancel job: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const resetProcessingIssues = async () => {
    setIsResettingStalled(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-stuck-processing', {
        body: { 
          action: 'reset_stuck_processing',
          cleanup_failed: true 
        }
      });

      if (error) throw error;

      toast({
        title: "Queue Cleaned & Issues Reset",
        description: "Removed failed items and reset stuck processing jobs",
      });
      
      loadPendingArticles();
      loadQueuedArticles();
      onRefresh?.();
    } catch (error) {
      console.error('Error resetting processing issues:', error);
      toast({
        title: "Reset Failed",
        description: "Could not reset processing issues. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResettingStalled(false);
    }
  };

  const extractRelevantKeywords = (content: string, title: string = ''): string[] => {
    if (!content && !title) return [];
    
    const combinedText = `${title} ${content}`.toLowerCase();
    
    // For ArticlePipelinePanel, we don't have topic keywords, so we'll do basic keyword extraction
    // but with more relevant filtering than just frequent words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'can', 'may', 'might', 'must', 'shall', 'it', 'its', 'they', 'them', 'their',
      'he', 'she', 'him', 'her', 'his', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
      'said', 'says', 'say', 'also', 'very', 'much', 'more', 'most', 'than', 'from',
      'up', 'out', 'down', 'over', 'under', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'since', 'until', 'while', 'where',
      'when', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose', 'if', 'unless',
      'mr', 'mrs', 'ms', 'dr', 'one', 'two', 'three', 'first', 'last', 'new', 'old'
    ]);
    
    // Extract words and filter for meaningful keywords
    const words = combinedText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word) &&
        /^[a-zA-Z]+$/.test(word) // Only alphabetic words
      );
    
    // Count frequency and prefer proper nouns and longer words
    const wordCount = words.reduce((acc, word) => {
      const isProperNoun = word[0] === word[0].toUpperCase();
      const bonus = isProperNoun ? 2 : 1;
      acc[word] = (acc[word] || 0) + bonus;
      return acc;
    }, {} as Record<string, number>);
    
    // Sort by frequency and take top 3, prioritizing longer words
    return Object.entries(wordCount)
      .sort(([a, countA], [b, countB]) => {
        if (countA !== countB) return countB - countA;
        return b.length - a.length;
      })
      .slice(0, 3)
      .map(([word]) => word);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Content Pipeline
        </CardTitle>
        <CardDescription>
          Review and approve articles for slide generation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {loadingArticles ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : articles.length === 0 && queuedArticles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No articles available for processing</p>
            </div>
          ) : (
            <>
              {/* Queued Articles */}
              {queuedArticles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-primary">Queued for Processing ({queuedArticles.length})</h3>
                    <div className="flex gap-2">
                      <Button 
                        onClick={resetProcessingIssues}
                        variant="destructive" 
                        size="sm"
                        disabled={isResettingStalled}
                      >
                        {isResettingStalled ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Cleaning...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3 mr-1" />
                            Clean Queue
                          </>
                        )}
                      </Button>
                      <Button 
                        onClick={loadQueuedArticles}
                        variant="outline" 
                        size="sm"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  {queuedArticles.map((article) => (
                    <Card key={`queued-${article.id}`} className="border border-primary/30 bg-primary/5">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={
                                article.is_stuck 
                                  ? 'bg-red-50 text-red-700 border-red-200' 
                                  : article.queue_status === 'processing' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-primary/10 text-primary border-primary/30'
                              }>
                                {article.is_stuck ? (
                                  <>
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Stuck
                                  </>
                                ) : article.queue_status === 'processing' ? (
                                  <>
                                    <Clock className="w-3 h-3 mr-1" />
                                    Processing
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 mr-1" />
                                    Queued
                                  </>
                                )}
                              </Badge>
                            </div>
                            <h3 className="font-semibold text-base mb-1 leading-tight">{article.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <span>{article.author || 'Unknown Author'}</span>
                              <span>•</span>
                              <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                            </div>
                            
                            <div className="flex gap-2">
                              {article.is_stuck ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => clearStuckJob(article)}
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Clear
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelQueuedJob(article)}
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const url = article.source_url;
                              if (url) {
                                window.open(url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Available Articles */}
              {articles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Available Articles ({articles.length})</h3>
                    <Button 
                      onClick={loadPendingArticles}
                      variant="outline" 
                      size="sm"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                  
                  {articles.map((article) => {
                    const hasLowWordCount = !article.word_count || article.word_count < 50;
                    
                    return (
                      <Card key={article.id} className="border">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-4">
                              <h3 className="font-semibold text-xl mb-2 leading-tight">{article.title}</h3>
                              
                              {/* Keyword flags */}
                              <div className="flex flex-wrap gap-1 mb-3">
                                {extractRelevantKeywords(article.body || '', article.title).map((keyword, index) => (
                                  <Badge 
                                    key={`${article.id}-keyword-${index}`}
                                    variant="outline" 
                                    className="text-xs px-2 py-0.5 bg-accent/10 text-accent-foreground border-accent/20 hover:bg-accent/20 transition-colors md:bg-muted/20 md:border-muted-foreground/30"
                                  >
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                <span>{article.author || 'Unknown Author'}</span>
                                <span>•</span>
                                <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                                {article.word_count && (
                                  <>
                                    <span>•</span>
                                    <span>{article.word_count} words</span>
                                  </>
                                )}
                              </div>
                              
                              <div className="flex gap-2">
                                {hasLowWordCount ? (
                                  <Button
                                    onClick={() => handleExtractContent(article)}
                                    disabled={processingArticle === article.id}
                                  >
                                    {processingArticle === article.id ? 'Extracting...' : 'Extract Content'}
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={() => approveArticle(article)}
                                    disabled={processingArticle === article.id}
                                  >
                                    Simplify
                                  </Button>
                                )}
                                
                                <Button
                                  variant="outline"
                                  onClick={() => rejectArticle(article.id)}
                                >
                                  Reject
                                </Button>
                                
                                <Button
                                  variant="destructive"
                                  onClick={() => deleteArticle(article.id)}
                                  disabled={deletingArticle === article.id}
                                >
                                  {deletingArticle === article.id ? 'Deleting...' : 'Delete'}
                                </Button>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const url = article.source_url;
                                if (url) {
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                }
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};