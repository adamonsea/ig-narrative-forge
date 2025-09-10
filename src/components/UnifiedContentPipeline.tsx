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
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { useTopicPipelineActions } from "@/hooks/useTopicPipelineActions";
import { useMultiTenantTopicPipeline } from "@/hooks/useMultiTenantTopicPipeline";
import { ArticlesList } from "@/components/topic-pipeline/ArticlesList";
import { MultiTenantArticlesList } from "@/components/topic-pipeline/MultiTenantArticlesList";
import { StoriesList } from "@/components/topic-pipeline/StoriesList";
import { MultiTenantStoriesList } from "@/components/topic-pipeline/MultiTenantStoriesList";
import { QueueList } from "@/components/topic-pipeline/QueueList";
import { MultiTenantQueueList } from "@/components/topic-pipeline/MultiTenantQueueList";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
  default_tone?: 'formal' | 'conversational' | 'engaging';
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
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const { toast } = useToast();

  // Legacy system data
  const {
    articles: legacyArticles,
    queueItems: legacyQueue,
    stories: legacyStories,
    loading: legacyLoading,
    stats: legacyStats,
    loadTopicContent: refreshLegacy
  } = useTopicPipeline(selectedTopicId);

  const {
    approveArticle,
    approveStory,
    rejectStory,
    returnToReview,
    deleteArticle,
    deleteStory,
    processingArticle,
    deletingArticles,
    animatingArticles
  } = useTopicPipelineActions(refreshLegacy, () => {});

  // Multi-tenant system data
  const {
    articles: multiTenantArticles,
    queueItems: multiTenantQueue,
    stories: multiTenantStories,
    loading: multiTenantLoading,
    stats: multiTenantStats,
    loadTopicContent: refreshMultiTenant,
    handleMultiTenantApprove,
    handleMultiTenantDelete,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    processingArticle: mtProcessingArticle,
    deletingArticles: mtDeletingArticles,
    animatingArticles: mtAnimatingArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Load topics
  useEffect(() => {
    const loadTopics = async () => {
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id, name, topic_type, is_active, keywords, landmarks, organizations, default_tone')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setTopics((data || []).map(topic => ({
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword'
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

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshLegacy(), refreshMultiTenant()]);
  }, [refreshLegacy, refreshMultiTenant]);

  const currentTopic = topics.find(t => t.id === selectedTopicId);
  const isLoading = legacyLoading || multiTenantLoading;

  // Combined data for overview
  const totalArticles = legacyArticles.length + multiTenantArticles.length;
  const totalQueue = legacyQueue.length + multiTenantQueue.length;
  const totalStories = legacyStories.length + multiTenantStories.length;

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

  const handleLegacyApprove = async (articleId: string) => {
    const slideQuantity = slideQuantities[articleId] || 'tabloid';
    const tone = toneOverrides[articleId] || 'conversational';
    const writingStyle = writingStyleOverrides[articleId] || 'journalistic';
    
    try {
      await approveArticle(articleId, slideQuantity, tone, writingStyle);
      toast({
        title: "Article Approved",
        description: "Legacy article sent to content generation",
      });
    } catch (error) {
      console.error('Error approving legacy article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
        variant: "destructive"
      });
    }
  };

  const handleMultiTenantApproveWrapper = async (articleId: string) => {
    const slideQuantity = slideQuantities[articleId] || 'tabloid';
    const tone = toneOverrides[articleId] || 'conversational';
    const writingStyle = writingStyleOverrides[articleId] || 'journalistic';
    
    try {
      await handleMultiTenantApprove(articleId, slideQuantity, tone, writingStyle);
      toast({
        title: "Article Approved",
        description: "Multi-tenant article sent to content generation",
      });
    } catch (error) {
      console.error('Error approving multi-tenant article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
        variant: "destructive"
      });
    }
  };

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
      await approveStory(storyId);
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
      await rejectStory(storyId);
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

  const handleStoryDelete = async (storyId: string, title: string) => {
    setDeletingStories(prev => new Set([...prev, storyId]));
    try {
      await deleteStory(storyId, title);
      toast({
        title: "Story Deleted",
        description: "Story has been deleted",
      });
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: "Error",
        description: "Failed to delete story",
        variant: "destructive"
      });
    } finally {
      setDeletingStories(prev => {
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
      await returnToReview(storyId);
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
          <TabsTrigger value="queue">
            Processing ({totalQueue})
          </TabsTrigger>
          <TabsTrigger value="stories">
            Published ({totalStories})
          </TabsTrigger>
        </TabsList>

        {/* Stories Tab - Most Important */}
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
            <div className="space-y-6">
              {/* Legacy Stories */}
              {legacyStories.length > 0 && (
                <Card>
                  <CardContent>
                    <StoriesList
                      stories={legacyStories}
                      expandedStories={expandedStories}
                      processingApproval={processingApproval}
                      processingRejection={processingRejection}
                      deletingStories={deletingStories}
                      publishingStories={publishingStories}
                      animatingStories={animatingStories}
                      onToggleExpanded={handleToggleStoryExpanded}
                      onApprove={handleStoryApprove}
                      onReject={handleStoryReject}
                      onDelete={handleStoryDelete}
                      onEditSlide={handleEditSlide}
                      onViewStory={() => {}}
                      onReturnToReview={handleReturnToReview}
                      onRefresh={refreshLegacy}
                      expandCarouselSection={() => {}}
                    />
                  </CardContent>
                </Card>
              )}
              
              {/* Multi-tenant Stories */}
              {multiTenantStories.length > 0 && (
                <Card>
                  <CardContent>
                    <MultiTenantStoriesList
                      stories={multiTenantStories}
                      expandedStories={expandedStories}
                      processingApproval={processingApproval}
                      processingRejection={processingRejection}
                      deletingStories={deletingStories}
                      publishingStories={publishingStories}
                      animatingStories={animatingStories}
                      onToggleExpanded={handleToggleStoryExpanded}
                      onApprove={handleMultiTenantApproveStory}
                      onReject={handleMultiTenantRejectStory}
                      onDelete={() => {}}
                      onEditSlide={handleEditSlide}
                      onViewStory={() => {}}
                      onReturnToReview={handleReturnToReview}
                      onRefresh={refreshMultiTenant}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-4">
          <div className="space-y-6">
            {/* Legacy Articles */}
            {legacyArticles.length > 0 && (
              <Card>
                <CardContent>
                  <ArticlesList
                    articles={legacyArticles}
                    processingArticle={processingArticle}
                    deletingArticles={deletingArticles}
                    animatingArticles={animatingArticles}
                    slideQuantities={slideQuantities}
                    toneOverrides={toneOverrides}
                    writingStyleOverrides={writingStyleOverrides}
                    onSlideQuantityChange={handleSlideQuantityChange}
                    onToneOverrideChange={handleToneOverrideChange}
                    onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                     onPreview={setPreviewArticle}
                    onApprove={handleLegacyApprove}
                    onDelete={deleteArticle}
                    defaultTone={currentTopic?.default_tone || 'conversational'}
                    defaultWritingStyle="journalistic"
                    topicKeywords={[]}
                    topicLandmarks={[]}
                    onRefresh={refreshLegacy}
                  />
                </CardContent>
              </Card>
            )}
            
            {multiTenantArticles.length > 0 && (
              <Card>
                <CardContent>
                  <MultiTenantArticlesList
                    articles={multiTenantArticles}
                    processingArticle={mtProcessingArticle}
                    deletingArticles={mtDeletingArticles}
                    slideQuantities={slideQuantities}
                    toneOverrides={toneOverrides}
                    writingStyleOverrides={writingStyleOverrides}
                    onSlideQuantityChange={handleSlideQuantityChange}
                    onToneOverrideChange={handleToneOverrideChange}
                    onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                    onPreview={setPreviewArticle}
                    onApprove={handleMultiTenantApproveWrapper}
                    onDelete={handleMultiTenantDelete}
                    onBulkDelete={() => {}}
                    defaultTone={currentTopic?.default_tone || 'conversational'}
                    defaultWritingStyle="journalistic"
                    onRefresh={refreshMultiTenant}
                  />
                </CardContent>
              </Card>
            )}
            
            {totalArticles === 0 && (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No articles available for approval</p>
                  <p className="text-sm mt-2">Check your sources and scraping settings</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Processing Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <div className="space-y-6">
            {/* Legacy Queue */}
            {legacyQueue.length > 0 && (
              <Card>
                <CardContent>
                  <QueueList
                    queueItems={legacyQueue}
                    deletingQueueItems={new Set()}
                    onCancel={() => {}}
                    onRetry={() => {}}
                  />
                </CardContent>
              </Card>
            )}
            
            {/* Multi-tenant Queue */}
            {multiTenantQueue.length > 0 && (
              <Card>
                <CardContent>
                  <MultiTenantQueueList
                    queueItems={multiTenantQueue}
                    deletingQueueItems={new Set()}
                    onCancel={() => {}}
                  />
                </CardContent>
              </Card>
            )}
            
            {totalQueue === 0 && (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No items in processing queue</p>
                  <p className="text-sm mt-2">Approve articles to add them to the queue</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {previewArticle?.title}
                <Badge variant="outline" className="text-xs">
                  {previewArticle?.source_name || previewArticle?.source || 'Unknown Source'}
                </Badge>
                {previewArticle?.topic_id && (
                  <Badge variant="secondary" className="text-xs">
                    Multi-Tenant
                  </Badge>
                )}
              </div>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-4">
              <span>Source: {previewArticle?.source_url}</span>
              {previewArticle?.author && <span>Author: {previewArticle.author}</span>}
              <span>Words: {previewArticle?.word_count || 0}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Article Content:</label>
              <div 
                className="min-h-[300px] mt-2 p-3 border rounded-md bg-background text-sm leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: highlightKeywords(previewArticle?.body || '', currentTopicKeywords)
                }}
              />
            </div>
            {previewArticle?.source_url && (
              <Button 
                variant="outline" 
                onClick={() => window.open(previewArticle.source_url, '_blank')}
                className="w-full"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Original Article
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};