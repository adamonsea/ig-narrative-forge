import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Loader2, AlertCircle, CheckCircle, ExternalLink, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";
import MultiTenantArticlesList from "@/components/topic-pipeline/MultiTenantArticlesList";
import { MultiTenantStoriesList } from "@/components/topic-pipeline/MultiTenantStoriesList";
import EventsListing from "@/components/EventsListing";



interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
  default_tone?: 'formal' | 'conversational' | 'engaging';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
}

interface UnifiedContentPipelineProps {
  selectedTopicId?: string;
}

export const UnifiedContentPipeline: React.FC<UnifiedContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [slideQuantities, setSlideQuantities] = useState<Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'>>({});
  const [toneOverrides, setToneOverrides] = useState<Record<string, 'formal' | 'conversational' | 'engaging' | undefined>>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined>>({});
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [publishingStories, setPublishingStories] = useState<Set<string>>(new Set());
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const [eventsCount, setEventsCount] = useState(0);
  const { toast } = useToast();

  // Multi-tenant system data (now the only system)
  const {
    articles,
    queueItems,
    stories,
    loading,
    stats,
    loadTopicContent: refreshContent,
    handleMultiTenantApprove,
    handleMultiTenantDelete,
    handleMultiTenantBulkDelete,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    markArticleAsDiscarded,
    promoteTopicArticle,
    processingArticle,
    deletingArticles,
    animatingArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Multi-tenant actions for additional functionality  
  const multiTenantActions = useMultiTenantActions();

  // Animation states for stories
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());

  // Load topics
  useEffect(() => {
    const loadTopics = async () => {
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id, name, topic_type, is_active, keywords, landmarks, organizations, default_tone, default_writing_style')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setTopics((data || []).map(topic => ({
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword',
          default_writing_style: topic.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven'
        })));

        if (data && data.length > 0 && !selectedTopicId && !propTopicId) {
          setSelectedTopicId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading topics:', error);
        toast({
          title: "Error",
          description: "Failed to load topics",
          variant: "destructive"
        });
      }
    };

    loadTopics();
  }, []);

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  const currentTopic = topics.find(t => t.id === selectedTopicId);

  // Unified data counts
  const totalArticles = articles.length;
  const totalQueue = queueItems.length;
  const totalStories = stories.length;
  const processingCount = queueItems.filter(q => 
    (q.status === 'processing' || q.status === 'pending') && 
    q.attempts < q.max_attempts
  ).length;
  const stuckCount = queueItems.filter(q => 
    q.status === 'pending' && 
    q.attempts >= q.max_attempts && 
    q.error_message
  ).length;
  // Article management handlers
  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({ ...prev, [articleId]: quantity }));
  };

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | undefined) => {
    setToneOverrides(prev => ({ ...prev, [articleId]: tone }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined) => {
    setWritingStyleOverrides(prev => ({ ...prev, [articleId]: style }));
  };

  const handleApprove = async (
    article: MultiTenantArticle, 
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid', 
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational', 
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    try {
      await handleMultiTenantApprove(article, slideType, tone, writingStyle);
      
      // Auto-trigger queue processing after approval
      setTimeout(async () => {
        try {
          console.log('🚀 Triggering queue processor...');
          const { data, error } = await supabase.functions.invoke('queue-processor');
          if (error) throw error;
          console.log('✅ Queue processor result:', data);
          toast({
            title: "Processing Started",
            description: `Started processing ${data?.processed || 0} articles`,
          });
        } catch (error) {
          console.warn('Failed to auto-trigger queue processing:', error);
        }
      }, 1000);
      
      toast({
        title: "Article Approved",
        description: "Article sent to content generation",
      });
    } catch (error) {
      console.error('Error approving article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
        variant: "destructive"
      });
    }
  };

  // Add bulk cleanup function using automated backend cleanup

  // Story management handlers
  const handleToggleStoryExpanded = (storyId: string) => {
    setExpandedStories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(storyId)) {
        newSet.delete(storyId);
      } else {
        newSet.add(storyId);
      }
      return newSet;
    });
  };

  const handleStoryApprove = async (storyId: string) => {
    setProcessingApproval(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantApproveStory(storyId);
      toast({
        title: "Story Approved",
        description: "Story approved and published",
      });
    } catch (error) {
      console.error('Error approving story:', error);
      toast({
        title: "Error",
        description: "Failed to approve story",
        variant: "destructive"
      });
    } finally {
      setProcessingApproval(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const handleStoryReject = async (storyId: string) => {
    setProcessingRejection(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantRejectStory(storyId);
      toast({
        title: "Story Rejected",
        description: "Story has been rejected",
      });
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Error",
        description: "Failed to reject story",
        variant: "destructive"
      });
    } finally {
      setProcessingRejection(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const handleEditSlide = (slide: any) => {
    // Simple placeholder for now - could open a dialog to edit slide content
    toast({
      title: "Edit Slide",
      description: "Slide editing functionality will be implemented soon",
    });
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      await handleMultiTenantRejectStory(storyId);
    } catch (error) {
      console.error('Error returning story to review:', error);
    }
  };

  if (!selectedTopicId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a Topic</CardTitle>
          <CardDescription>Choose a topic to manage its content</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Function to highlight whole keywords in text
  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!text || !keywords.length) return text;
    
    let highlightedText = text;
    keywords.forEach(keyword => {
      if (keyword && keyword.trim()) {
        // Use word boundaries to match whole words only
        const regex = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
      }
    });
    
    return highlightedText;
  };

  const currentTopicKeywords = currentTopic ? 
    [...(currentTopic.keywords || []), ...(currentTopic.landmarks || []), ...(currentTopic.organizations || [])] 
    : [];

  return (
    <div className="space-y-6">
      {/* Main Content Tabs */}
      <Tabs defaultValue="articles" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="articles">
            Arrivals ({totalArticles})
          </TabsTrigger>
          <TabsTrigger value="stories" className="flex items-center gap-2">
            <span>Published ({stories.filter(s => s.status === 'ready').length})</span>
            {processingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-primary animate-fade-in">
                <span aria-hidden className="h-2 w-2 rounded-full bg-primary pulse" />
                <span className="text-xs">{processingCount}</span>
              </span>
            )}
            {stuckCount > 0 && (
              <span className="inline-flex items-center gap-1 text-destructive animate-fade-in">
                <span aria-hidden className="h-2 w-2 rounded-full bg-destructive" />
                <span className="text-xs" title={`${stuckCount} items need attention`}>{stuckCount}</span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="events">
            Events ({eventsCount})
          </TabsTrigger>
        </TabsList>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Showing new articles awaiting review
            </div>
          </div>
          
          {totalArticles === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No articles available</p>
                <p className="text-sm mt-2">Articles will appear here when scraped</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <MultiTenantArticlesList
                  articles={articles}
                  processingArticle={processingArticle}
                  deletingArticles={deletingArticles}
                  animatingArticles={animatingArticles}
                  slideQuantityOverrides={slideQuantities}
                  toneOverrides={toneOverrides}
                  writingStyleOverrides={writingStyleOverrides}
                  onSlideQuantityChange={handleSlideQuantityChange}
                  onToneOverrideChange={handleToneOverrideChange}
                  onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                  onPreview={setPreviewArticle}
                  onApprove={(article, slideType, tone, writingStyle) => 
                    handleApprove(article, slideType, tone, writingStyle)
                  }
                  onDelete={handleMultiTenantDelete}
                  onBulkDelete={handleMultiTenantBulkDelete}
                  onPromote={promoteTopicArticle}
                  defaultTone={currentTopic?.default_tone || 'conversational'}
                  defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
                  onRefresh={refreshContent}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Stories Tab */}
        <TabsContent value="stories" className="space-y-4">
          {totalStories === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No stories available yet</p>
                <p className="text-sm mt-2">Approve some articles to generate stories</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <MultiTenantStoriesList
                  stories={stories.filter(story => story.status === 'ready')}
                  expandedStories={expandedStories}
                  processingApproval={processingApproval}
                  processingRejection={processingRejection}
                  deletingStories={deletingStories}
                  publishingStories={publishingStories}
                  animatingStories={animatingArticles}
                  onToggleExpanded={handleToggleStoryExpanded}
                  onApprove={handleStoryApprove}
                  onReject={handleStoryReject}
                  onDelete={() => {}}
                  onEditSlide={handleEditSlide}
                  onViewStory={() => {}}
                  onReturnToReview={handleReturnToReview}
                  onRefresh={refreshContent}
                />
              </CardContent>
            </Card>
           )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardContent>
              <EventsListing topicId={selectedTopicId} onEventsCountChange={setEventsCount} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Article Preview Dialog */}
      <Dialog open={previewArticle !== null} onOpenChange={(open) => !open && setPreviewArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewArticle?.title}
              {previewArticle?.url && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={previewArticle.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              <div className="flex flex-wrap gap-2 mt-2">
                {previewArticle?.word_count && (
                  <Badge variant="secondary">{previewArticle.word_count} words</Badge>
                )}
                {previewArticle?.regional_relevance_score && (
                  <Badge variant="secondary">Relevance: {previewArticle.regional_relevance_score}%</Badge>
                )}
                {previewArticle?.content_quality_score && (
                  <Badge variant="secondary">Quality: {previewArticle.content_quality_score}%</Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewArticle?.body && (
              <div className="prose max-w-none">
                <Textarea
                  value={previewArticle.body}
                  readOnly
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};