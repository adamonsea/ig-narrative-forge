import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2, 
  X, 
  Clock, 
  AlertTriangle, 
  ExternalLink,
  Sparkles,
  XCircle,
  Edit3,
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  Calendar,
  User,
  MapPin
} from 'lucide-react';

// Article interfaces
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

// Slide and Story interfaces
interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface StoryArticle {
  id: string;
  title: string;
  author?: string;
  source_url: string;
  region?: string;
  published_at?: string | null;
  word_count?: number | null;
}

interface Post {
  id: string;
  caption?: string;
  hashtags?: any;
  source_attribution?: string;
  story_id: string;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  articles?: StoryArticle; // Different query aliases
  posts?: Post[];
}

interface ContentPipelineProps {
  onRefresh?: () => void;
}

export const ContentPipeline = ({ onRefresh }: ContentPipelineProps) => {
  // Article queue state
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);

  // Story state
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [isResettingStalled, setIsResettingStalled] = useState(false);

  // Edit slide state
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    loadPendingArticles();
    loadStories();
  }, []);

  const resetStalledProcessing = async () => {
    setIsResettingStalled(true);
    try {
      const { error } = await supabase.rpc('reset_stalled_processing');
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Stalled processing jobs have been reset",
      });
      
      // Reload stories to show updated status
      loadStories();
    } catch (error) {
      console.error('Error resetting stalled processing:', error);
      toast({
        title: "Error",
        description: "Failed to reset stalled processing jobs",
        variant: "destructive",
      });
    } finally {
      setIsResettingStalled(false);
    }
  };

  // Article queue functions
  const loadPendingArticles = async () => {
    try {
      setLoadingArticles(true);
      
      // Only fetch articles with 'new' processing status
      const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('processing_status', 'new')
        .order('created_at', { ascending: false })
        .limit(50);

      if (articlesError) throw articlesError;

      const pendingArticles = articles || [];

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

      const sortedArticles = pendingArticles.sort((a, b) => {
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
      
      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { 
          articleId: article.id,
          slideType: slideType
        }
      });

      if (error) throw new Error(`Function call failed: ${error.message}`);
      if (!data) throw new Error('No response data from content generator');
      if (!data.success) throw new Error(data.error || 'Content generation failed');

      const typeLabels = {
        short: 'Short Carousel',
        tabloid: 'Tabloid Style',
        indepth: 'In-Depth Analysis'
      };

      toast({
        title: 'Slides Generated!',
        description: `Created ${data.slideCount} slides (${typeLabels[slideType]}) - review in right panel`,
      });

      // Refresh both panels
      await Promise.all([loadPendingArticles(), loadStories()]);
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
      // Update processing status to 'discarded'
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

      // Remove from local state
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

  // Story functions
  const loadStories = async () => {
    setLoadingStories(true);
    try {
      const { data: stories, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides:slides(*),
          article:articles!stories_article_id_fkey(
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          ),
          posts:posts(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories(stories || []);
    } catch (error) {
      console.error('Error loading stories:', error);
      toast({
        title: "Error",
        description: "Failed to load stories",
        variant: "destructive",
      });
    } finally {
      setLoadingStories(false);
    }
  };

  const handleApproveStory = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'ready' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Approved',
        description: 'Story approved and ready for publishing',
      });

      loadStories();
    } catch (error) {
      console.error('Failed to approve story:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve story',
        variant: 'destructive',
      });
    }
  };

  const handleRejectStory = async (storyId: string) => {
    try {
      // Delete the story and its slides - this returns the article to validation queue
      const { error: slidesError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', storyId);

      if (slidesError) throw slidesError;

      const { error: storyError } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (storyError) throw storyError;
      
      setStories(stories.filter(story => story.id !== storyId));
      toast({
        title: "Story Rejected",
        description: "Story deleted and article returned to validation queue.",
      });

      // Refresh article queue as the article is now available again
      loadPendingArticles();
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Error", 
        description: "Failed to reject story. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'draft' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Returned to Review',
        description: 'Story status changed to draft for re-review',
      });

      loadStories();
    } catch (error) {
      console.error('Failed to return story:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to review',
        variant: 'destructive',
      });
    }
  };

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setEditContent(slide.content);
  };

  const handleSaveSlide = async () => {
    if (!editingSlide) return;

    try {
      const wordCount = editContent.trim().split(/\s+/).length;
      
      const { error } = await supabase
        .from('slides')
        .update({ 
          content: editContent.trim(),
          word_count: wordCount
        })
        .eq('id', editingSlide.id);

      if (error) throw error;

      toast({
        title: 'Slide Updated',
        description: 'Slide content has been updated',
      });

      setEditingSlide(null);
      loadStories();
    } catch (error) {
      console.error('Failed to update slide:', error);
      toast({
        title: 'Error',
        description: 'Failed to update slide',
        variant: 'destructive',
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
    const newExpanded = new Set(expandedStories);
    if (newExpanded.has(storyId)) {
      newExpanded.delete(storyId);
    } else {
      newExpanded.add(storyId);
    }
    setExpandedStories(newExpanded);
  };

  // Helper functions
  const getRelevanceColor = (score: number) => {
    if (score >= 15) return 'bg-green-500';
    if (score >= 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getWordCountBadge = (wordCount: number) => {
    if (wordCount <= 15) return <Badge variant="default" className="text-xs">Hook</Badge>;
    if (wordCount <= 30) return <Badge variant="secondary" className="text-xs">Body</Badge>;
    return <Badge variant="outline" className="text-xs">Long</Badge>;
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500">Published</Badge>;
      case 'draft':
        return <Badge variant="outline">Pending Review</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Approved</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Separate stories by status
  const draftStories = stories.filter(story => story.status === 'draft');
  const processedStories = stories.filter(story => story.status !== 'draft');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: Content Pipeline */}
      <div className="space-y-6">
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
            {loadingArticles ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : articles.length === 0 ? (
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

      {/* Right Panel: Slide Review & Management */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Slide Review & Management
            </CardTitle>
            <CardDescription>
              Review, approve, and manage AI-generated slide carousels
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStories ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : stories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No slide stories generated yet</p>
                <p className="text-sm">Approve articles in the left panel to create slides</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pending Review Section */}
                {draftStories.length > 0 && (
                  <div className="space-y-4">
                     <div className="flex items-center gap-2">
                       <Badge variant="outline">{draftStories.length} pending review</Badge>
                       <Button variant="outline" size="sm" onClick={loadStories}>
                         <RotateCcw className="w-3 h-3 mr-1" />
                         Refresh
                       </Button>
                       <Button 
                         variant="outline" 
                         size="sm" 
                         onClick={resetStalledProcessing}
                         disabled={isResettingStalled}
                       >
                         <RotateCcw className={`w-3 h-3 mr-1 ${isResettingStalled ? 'animate-spin' : ''}`} />
                         Reset Stalled
                       </Button>
                     </div>
                    
                    {draftStories.map((story) => (
                      <Card key={story.id} className="border-orange-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{story.title}</CardTitle>
                            <div className="flex gap-2">
                              {story.article?.source_url && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => window.open(story.article.source_url, '_blank')}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStoryExpanded(story.id)}
                              >
                                {expandedStories.has(story.id) ? (
                                  <>
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-4 w-4 mr-1" />
                                    View ({story.slides?.length || 0})
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{story.slides?.length || 0} slides</span>
                            <span>{new Date(story.created_at).toLocaleDateString()}</span>
                            {story.article?.author && <span>by {story.article.author}</span>}
                          </div>
                        </CardHeader>

                        {expandedStories.has(story.id) && (
                          <CardContent>
                            <div className="space-y-3">
                              {story.slides?.map((slide) => (
                                <div key={slide.id} className="border rounded-lg p-4 bg-muted/30">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        Slide {slide.slide_number}
                                      </Badge>
                                      {getWordCountBadge(slide.word_count)}
                                      <span className="text-xs text-muted-foreground">
                                        {slide.word_count} words
                                      </span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditSlide(slide)}
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <p className="text-sm leading-relaxed">{slide.content}</p>
                                  {slide.alt_text && (
                                    <p className="text-xs text-muted-foreground mt-2 italic">
                                      Alt text: {slide.alt_text}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        )}
                        
                        <div className="flex items-center justify-end gap-2 p-4 pt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectStory(story.id)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApproveStory(story.id)}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Processed Stories Section */}
                {processedStories.length > 0 && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Processed Stories</h3>
                      <Badge variant="secondary">{processedStories.length}</Badge>
                    </div>
                    
                    {processedStories.map((story) => (
                      <div key={story.id} className="border rounded-lg overflow-hidden">
                        <div className="p-4 bg-muted/50">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-medium">{story.title}</h3>
                                {getStatusBadge(story.status)}
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  <span>{story.slides?.length || 0} slides</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>{new Date(story.created_at).toLocaleDateString()}</span>
                                </div>
                                {story.article?.author && (
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    <span>{story.article.author}</span>
                                  </div>
                                )}
                                {story.article?.region && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    <span>{story.article.region}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {story.status !== 'draft' && story.status !== 'processing' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleReturnToReview(story.id)}
                                  className="h-8 px-2 text-xs"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Return to Review
                                </Button>
                              )}
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(story.article?.source_url, '_blank')}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleStoryExpanded(story.id)}
                              >
                                <Eye className="w-3 h-3 mr-2" />
                                {expandedStories.has(story.id) ? 'Hide' : 'View'}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {expandedStories.has(story.id) && story.slides && (
                          <div className="p-4 space-y-3 border-t">
                            {story.slides
                              .sort((a, b) => a.slide_number - b.slide_number)
                              .map((slide) => (
                                <div key={slide.id} className="p-3 bg-muted/30 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      Slide {slide.slide_number}
                                    </span>
                                    <span className={`text-xs ${getWordCountColor(slide.word_count, slide.slide_number)}`}>
                                      {slide.word_count} words
                                    </span>
                                  </div>
                                  
                                  <p className="text-sm mb-2">{slide.content}</p>
                                  
                                  {slide.visual_prompt && (
                                    <div className="text-xs text-muted-foreground">
                                      <strong>Visual:</strong> {slide.visual_prompt}
                                    </div>
                                  )}
                                  
                                  {slide.alt_text && (
                                    <div className="text-xs text-muted-foreground">
                                      <strong>Alt text:</strong> {slide.alt_text}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Slide Modal */}
      {editingSlide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>Edit Slide {editingSlide.slide_number}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                placeholder="Slide content..."
              />
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Word count: {editContent.trim().split(/\s+/).filter(w => w).length}
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingSlide(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSlide}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};