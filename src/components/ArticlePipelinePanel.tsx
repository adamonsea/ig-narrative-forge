import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  ExternalLink,
  Sparkles,
  XCircle,
  Clock,
  RefreshCw,
  MapPin,
  Zap,
  Trash2,
  X,
  FileText
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
  const [isResettingStalled, setIsResettingStalled] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'deepseek'>('deepseek');

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
            import_metadata,
            source_name:content_sources(source_name),
            source_domain:content_sources(canonical_domain)
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
            import_metadata: {},
            source_name: article.source_name?.source_name || 'Unknown',
            source_domain: article.source_domain?.canonical_domain || 'unknown.com',
            queue_status: queueInfo?.status || 'pending',
            queue_type: queueInfo?.slidetype || 'tabloid',
            queue_id: queueInfo?.id,
            queue_attempts: queueInfo?.attempts || 0,
            queue_max_attempts: queueInfo?.max_attempts || 3,
            queue_error: queueInfo?.error_message,
            is_stuck: isStuck
          };
        }).filter(article => 
          // Filter out failed items - exclude items that have exhausted all attempts
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

      // Sort articles: non-reviews first (by relevance), then reviews at bottom
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
               /\d\/\d+/.test(title);
      };

      const sortedArticles = availableArticles.sort((a, b) => {
        const aIsReview = isReview(a);
        const bIsReview = isReview(b);
        
        if (aIsReview && !bIsReview) return 1;
        if (!aIsReview && bIsReview) return -1;
        
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
      setLoadingArticles(false);
    }
  };

  const approveArticle = async (article: Article, slideType: 'short' | 'tabloid' | 'indepth' = 'tabloid') => {
    try {
      setProcessingArticle(article.id);
      
      const { data: queueJob, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: article.id,
          slidetype: slideType,
          ai_provider: selectedProvider,
          status: 'pending'
        })
        .select()
        .single();

      if (queueError) throw new Error(`Failed to queue job: ${queueError.message}`);

      const typeLabels = {
        short: 'Short Carousel',
        tabloid: 'Tabloid Style',
        indepth: 'In-Depth Analysis'
      };

      const providerLabels = {
        openai: 'OpenAI',
        deepseek: 'DeepSeek'
      };

      toast({
        title: 'Generation Queued!',
        description: `${typeLabels[slideType]} generation with ${providerLabels[selectedProvider]} added to queue. Processing will start shortly.`,
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
        const wordCountChange = data.wordCount ? ` (${data.wordCount} words)` : '';
        const extractedLength = data.bodyLength ? ` ${data.bodyLength} characters` : '';
        const method = data.extractionMethod || 'direct';
        
        toast({
          title: 'Content Extracted Successfully',
          description: `Extracted${wordCountChange} using ${method} method.${extractedLength ? ` Content: ${extractedLength}` : ''}`,
        });
        
        if (data.wordCount && data.wordCount > 10) {
          setTimeout(() => {
            toast({
              title: 'Content Preview',
              description: data.title ? `"${data.title.substring(0, 100)}..."` : 'Content successfully extracted from article',
            });
          }, 1000);
        }
        
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

      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('article_id', article.id);

      if (resetError) {
        console.warn('Could not reset story status:', resetError);
      }

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

      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('article_id', article.id);

      if (resetError) {
        console.warn('Could not reset story status:', resetError);
      }

      toast({
        title: "Job Cancelled",
        description: `Cancelled generation for "${article.title}" - returned to pipeline`,
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
      // Clean up failed items and reset stuck processing
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

  const returnToPipeline = async (article: Article) => {
    try {
      // First remove from queue
      if (article.queue_id) {
        const { error: deleteError } = await supabase
          .from('content_generation_queue')
          .delete()
          .eq('id', article.queue_id);

        if (deleteError) throw deleteError;
      }

      // Then reset article status to new
      const { error: resetError } = await supabase
        .from('articles')
        .update({ 
          processing_status: 'new',
          updated_at: new Date().toISOString()
        })
        .eq('id', article.id);

      if (resetError) throw resetError;

      toast({
        title: "Returned to Pipeline",
        description: `"${article.title}" has been returned to the pending pipeline`,
      });
      
      loadQueuedArticles();
      loadPendingArticles();
    } catch (error: any) {
      console.error('Error returning to pipeline:', error);
      toast({
        title: "Return Failed",
        description: "Could not return article to pipeline. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 15) return 'bg-green-500';
    if (score >= 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getArticleWordCountBadge = (wordCount: number) => {
    return <Badge variant="outline" className="text-xs">{wordCount} words</Badge>;
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
                          className="text-xs font-medium"
                        >
                          {isResettingStalled ? (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Cleaning Queue...
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3 mr-1" />
                              Clean Queue & Reset Issues
                            </>
                          )}
                        </Button>
                        <Button 
                          onClick={loadQueuedArticles}
                          variant="outline" 
                          size="sm"
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  {queuedArticles.map((article) => (
                    <Card key={`queued-${article.id}`} className="border border-primary/30 bg-primary/5">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={`text-xs ${
                                article.is_stuck 
                                  ? 'bg-red-50 text-red-700 border-red-200' 
                                  : article.queue_status === 'processing' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-primary/10 text-primary border-primary/30'
                              }`}>
                                {article.is_stuck ? (
                                  <>
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Stuck ({article.queue_attempts}/{article.queue_max_attempts})
                                  </>
                                ) : article.queue_status === 'processing' ? (
                                  <>
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-1" />
                                    Processing
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 mr-1" />
                                    Queued ({article.queue_type})
                                  </>
                                )}
                              </Badge>
                              {getArticleWordCountBadge(article.word_count || 0)}
                            </div>
                            <h3 className="font-medium text-sm mb-1 line-clamp-2">{article.title}</h3>
                            {/* Error messages now shown via toast instead of inline */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <span>{article.author || 'Unknown Author'}</span>
                              <span>•</span>
                              <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                              {article.region && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-xs">{article.region}</Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex gap-2">
                            {article.is_stuck ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => clearStuckJob(article)}
                                className="flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Clear Stuck Job
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => cancelQueuedJob(article)}
                                className="flex items-center gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => returnToPipeline(article)}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Return to Pipeline
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                               let url = article.source_url;
                               if (!url) {
                                 toast({
                                   title: 'No URL Available',
                                   description: 'This article doesn\'t have a source URL',
                                   variant: 'destructive',
                                 });
                                 return;
                               }

                               url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
                               const validUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
                               
                                 try {
                                   console.log('Opening URL:', validUrl);
                                   window.open(validUrl, '_blank', 'noopener,noreferrer');
                                 } catch (error) {
                                 console.warn('Failed to open URL, copying instead:', error);
                                 navigator.clipboard?.writeText(validUrl);
                                 toast({
                                   title: 'Link Copied',
                                   description: 'Popup blocked. Article URL copied to clipboard - paste in browser to view.',
                                 });
                               }
                             }}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View Original
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
                    <div className="flex gap-2">
                      <Button 
                        onClick={loadPendingArticles}
                        variant="outline" 
                        size="sm"
                        className="text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  
                  {articles.map((article) => {
                    const relevanceScore = (article.import_metadata as any)?.eastbourne_relevance_score || 0;
                    const hasLowWordCount = !article.word_count || article.word_count < 50;
                    
                    return (
                      <Card key={article.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${getRelevanceColor(relevanceScore)}`}></div>
                                <Badge variant="outline" className="text-xs">{relevanceScore}/20</Badge>
                                {getArticleWordCountBadge(article.word_count || 0)}
                                {hasLowWordCount && (
                                  <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                    <Zap className="w-2 h-2 mr-1" />
                                    Extract Needed
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-medium text-sm mb-1 line-clamp-2">{article.title}</h3>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <span>{article.author || 'Unknown Author'}</span>
                                <span>•</span>
                                <span>{new Date(article.published_at || article.created_at).toLocaleDateString()}</span>
                                {article.region && (
                                  <>
                                    <span>•</span>
                                    <MapPin className="w-3 h-3" />
                                    <span>{article.region}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center mt-2">
                            <div className="flex gap-2">
                              {hasLowWordCount ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleExtractContent(article)}
                                  disabled={processingArticle === article.id}
                                  className="flex items-center gap-1 bg-orange-100 text-orange-800 hover:bg-orange-200"
                                >
                                  {processingArticle === article.id ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-current border-t-transparent animate-spin rounded-full" />
                                      Extracting...
                                    </>
                                  ) : (
                                    <>
                                      <Zap className="w-3 h-3" />
                                      Extract Content
                                    </>
                                  )}
                                </Button>
                               ) : (
                                <>
                                  <div className="flex flex-col gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">AI Provider:</span>
                                      <Select value={selectedProvider} onValueChange={(value: 'openai' | 'deepseek') => setSelectedProvider(value)}>
                                        <SelectTrigger className="w-24 h-7 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="deepseek" className="text-xs">
                                            <div className="flex items-center gap-1">
                                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                              DeepSeek
                                            </div>
                                          </SelectItem>
                                          <SelectItem value="openai" className="text-xs">
                                            <div className="flex items-center gap-1">
                                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                              OpenAI
                                            </div>
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => approveArticle(article, 'short')}
                                      disabled={processingArticle === article.id}
                                      className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      Short
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => approveArticle(article, 'tabloid')}
                                      disabled={processingArticle === article.id}
                                      className="flex items-center gap-1"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      Tabloid
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => approveArticle(article, 'indepth')}
                                      disabled={processingArticle === article.id}
                                      className="flex items-center gap-1"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      In-Depth
                                    </Button>
                                  </div>
                                </>
                               )}
                               <Button
                                 size="sm"
                                 variant="destructive"
                                 onClick={() => rejectArticle(article.id)}
                                 className="flex items-center gap-1"
                               >
                                 <XCircle className="w-3 h-3" />
                                 Reject
                               </Button>
                            </div>
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