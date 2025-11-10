import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Loader2, AlertCircle, CheckCircle, ExternalLink, Trash2, Zap, Bot, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";
import MultiTenantArticlesList from "@/components/topic-pipeline/MultiTenantArticlesList";
import { MultiTenantQueueList } from "@/components/topic-pipeline/MultiTenantQueueList";
import { MultiTenantStoriesList } from "@/components/topic-pipeline/MultiTenantStoriesList";
import { PublishedStoriesList } from "@/components/topic-pipeline/PublishedStoriesList";
import { SentimentCardsReview } from "@/components/SentimentCardsReview";
import { CommunityPulseReview } from "@/components/CommunityPulseReview";
import { ApprovedStoriesPanel } from "@/components/ApprovedStoriesPanel";
import { NewContentBadge } from "@/components/ui/new-content-badge";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  auto_simplify_enabled?: boolean;
  automation_quality_threshold?: number;
}

interface UnifiedContentPipelineProps {
  selectedTopicId?: string;
}

export const UnifiedContentPipeline: React.FC<UnifiedContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicSlug, setTopicSlug] = useState<string>('');
  const [slideQuantities, setSlideQuantities] = useState<Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'>>({});
  const [toneOverrides, setToneOverrides] = useState<Record<string, 'formal' | 'conversational' | 'engaging' | 'satirical' | undefined>>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined>>({});
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [publishingStories, setPublishingStories] = useState<Set<string>>(new Set());
  const [deletingQueueItems, setDeletingQueueItems] = useState<Set<string>>(new Set());
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const [sentimentCount, setSentimentCount] = useState(0);
  const [parliamentaryFilter, setParliamentaryFilter] = useState(false);
  const { toast } = useToast();

  const [runningPublishMigration, setRunningPublishMigration] = useState(false);

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
    handleMultiTenantCancelQueue,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    markArticleAsDiscarded,
    promoteTopicArticle,
    processingArticle,
    deletingArticles,
    animatingArticles,
    newArrivals,
    newPublished,
    clearNewArrivals,
    clearNewPublished
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
          .select('id, name, topic_type, is_active, keywords, landmarks, organizations, default_tone, default_writing_style, auto_simplify_enabled, automation_quality_threshold')
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

  // Load sentiment card count for Insights tab
  useEffect(() => {
    const loadSentimentCount = async () => {
      if (!selectedTopicId) return;
      
      try {
        const { count, error } = await supabase
          .from('sentiment_cards')
          .select('*', { count: 'exact', head: true })
          .eq('topic_id', selectedTopicId);

        if (error) throw error;
        setSentimentCount(count || 0);
      } catch (error) {
        console.error('Error loading sentiment count:', error);
      }
    };

    loadSentimentCount();
  }, [selectedTopicId]);

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  const currentTopic = topics.find(t => t.id === selectedTopicId);

  // Load topic slug when selectedTopicId changes
  useEffect(() => {
    const loadTopicSlug = async () => {
      if (!selectedTopicId) return;
      
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('slug')
          .eq('id', selectedTopicId)
          .single();
        
        if (error) throw error;
        if (data) setTopicSlug(data.slug);
      } catch (error) {
        console.error('Error loading topic slug:', error);
      }
    };
    
    loadTopicSlug();
  }, [selectedTopicId]);

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

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | undefined) => {
    setToneOverrides(prev => ({ ...prev, [articleId]: tone }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined) => {
    setWritingStyleOverrides(prev => ({ ...prev, [articleId]: style }));
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

  
  // Handler functions for Published stories
  const handleArchiveStory = async (storyId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ 
          status: 'archived',
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Story "${title}" archived successfully`,
      });
      refreshContent();
    } catch (error) {
      console.error('Error archiving story:', error);
      toast({
        title: "Error",
        description: "Failed to archive story",
        variant: "destructive",
      });
    }
  };

  const handleViewStory = (story: any) => {
    if (story.id && topicSlug) {
      window.open(`/feed/${topicSlug}/story/${story.id}`, '_blank');
    } else if (story.id) {
      // Fallback if topicSlug not available
      window.open(`/story/${story.id}`, '_blank');
    }
  };

  // Publish ready stories migration
  const runPublishMigration = useCallback(async () => {
    try {
      setRunningPublishMigration(true);
      const { data, error } = await supabase.functions.invoke('publish-ready-stories', {
        body: {}
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to publish ready stories');
      }
      toast({
        title: 'Published',
        description: data.message || 'Converted ready stories to published',
      });
      await refreshContent();
    } catch (err: any) {
      console.error('Publish migration failed:', err);
      toast({
        title: 'Migration failed',
        description: err.message || 'Could not publish ready stories',
        variant: 'destructive',
      });
    } finally {
      setRunningPublishMigration(false);
    }
  }, [supabase, toast, refreshContent]);

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
    if (!text) return '';

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let highlightedText = escapeHtml(text);

    if (!keywords.length) {
      return highlightedText;
    }

    keywords.forEach(keyword => {
      if (keyword && keyword.trim()) {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const useWordBoundaries = /^[\w-]+$/.test(keyword.trim());
        const boundary = useWordBoundaries ? '\\b' : '';
        const regex = new RegExp(`${boundary}(${escapedKeyword})${boundary}`, 'gi');
        highlightedText = highlightedText.replace(
          regex,
          '<mark class="bg-yellow-200 px-1 rounded">$1</mark>'
        );
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="articles" className="relative">
            <div className="flex items-center gap-2">
              <span>Arrivals ({totalArticles})</span>
              {currentTopic?.auto_simplify_enabled && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  <Bot className="w-3 h-3 mr-1" />
                  Auto
                </Badge>
              )}
              <NewContentBadge 
                show={newArrivals} 
                onDismiss={clearNewArrivals}
              />
            </div>
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <span>Processing ({queueItems.length})</span>
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
          <TabsTrigger value="published">
            <div className="flex items-center gap-2">
              <span>Published</span>
              {stories.filter(s => s.is_parliamentary).length > 0 && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                  <Users className="w-3 h-3 mr-1" />
                  {stories.filter(s => s.is_parliamentary).length}
                </Badge>
              )}
              <NewContentBadge 
                show={newPublished} 
                onDismiss={clearNewPublished}
              />
            </div>
          </TabsTrigger>
          <TabsTrigger value="insights">
            Insights ({sentimentCount})
          </TabsTrigger>
        </TabsList>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Showing new articles awaiting review
              {currentTopic?.auto_simplify_enabled && (
                <Badge variant="outline" className="ml-2 text-xs">
                  <Bot className="w-3 h-3 mr-1" />
                  Auto-simplification enabled (threshold: {currentTopic.automation_quality_threshold || 60}%)
                </Badge>
              )}
            </div>
          </div>
          
          {totalArticles === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-semibold">No new arrivals</p>
                <p className="text-sm mt-2">
                  New articles appear here when scraped. Already processed articles are moved to Published.
                </p>
                <p className="text-xs mt-3 text-muted-foreground/70">
                  💡 Tip: Use "Gather All" to fetch fresh content from all sources
                </p>
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
                    handleMultiTenantApprove(article, slideType, tone, writingStyle)
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

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-4">
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('auto-recover-stuck-stories');
                  if (error) throw error;
                  toast({
                    title: "Recovery Triggered",
                    description: `Recovered ${data?.totalRecovered || 0} stuck items`,
                  });
                  refreshContent();
                } catch (error) {
                  toast({
                    title: "Recovery Failed",
                    description: error instanceof Error ? error.message : "Failed to recover stuck items",
                    variant: "destructive",
                  });
                }
              }}
            >
              Recover stuck
            </Button>
          </div>
          <Card>
            <CardContent>
            {queueItems.length > 0 ? (
              <MultiTenantQueueList
                queueItems={queueItems}
                deletingQueueItems={deletingQueueItems}
                onCancel={handleMultiTenantCancelQueue}
              />
            ) : (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Zap className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">No Items Processing</h3>
                <p className="text-muted-foreground">
                  Content generation queue is empty. Approved articles will appear here while being processed.
                </p>
              </div>
            )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Published Tab */}
        <TabsContent value="published" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Stories that are published and visible in the feed
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  id="parliamentary-filter"
                  checked={parliamentaryFilter}
                  onCheckedChange={setParliamentaryFilter}
                />
                <Label htmlFor="parliamentary-filter" className="text-sm">
                  Show only parliamentary stories
                </Label>
              </div>
            </div>
            <Button
              variant="outline" 
              size="sm"
              onClick={refreshContent}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
          
          {stories.filter(s => s.is_published && ['ready', 'published'].includes(s.status) && (!parliamentaryFilter || s.is_parliamentary)).length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No {parliamentaryFilter ? 'parliamentary ' : ''}published stories</p>
                <p className="text-sm mt-2">
                  {parliamentaryFilter 
                    ? 'No parliamentary voting stories have been published yet'
                    : 'Approved stories will appear here when published to the feed'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <PublishedStoriesList 
                  stories={stories.filter(s => s.is_published && (!parliamentaryFilter || s.is_parliamentary))}
                  onArchive={handleArchiveStory}
                  onReturnToReview={handleMultiTenantRejectStory}
                  onDelete={handleMultiTenantRejectStory}
                  onViewStory={handleViewStory}
                  onRefresh={refreshContent}
                  loading={loading}
                  topicSlug={topicSlug}
                  topicId={selectedTopicId}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          {selectedTopicId && (
            <>
              <Card>
                <CardContent className="pt-6">
                  <SentimentCardsReview topicId={selectedTopicId} />
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <CommunityPulseReview topicId={selectedTopicId} />
                </CardContent>
              </Card>
            </>
          )}
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
                <div
                  className="min-h-[300px] whitespace-pre-wrap font-mono text-sm leading-relaxed border rounded-md p-4 bg-muted/30"
                  dangerouslySetInnerHTML={{
                    __html: highlightKeywords(previewArticle.body, currentTopicKeywords)
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
