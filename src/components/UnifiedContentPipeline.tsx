import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Loader2, AlertCircle, CheckCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";
import MultiTenantArticlesList from "@/components/topic-pipeline/MultiTenantArticlesList";

import { MultiTenantStoriesList } from "@/components/topic-pipeline/MultiTenantStoriesList";
import { PublishedStoriesList } from "@/components/topic-pipeline/PublishedStoriesList";
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
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
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
  const [toneOverrides, setToneOverrides] = useState<Record<string, 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined>>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined>>({});
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [publishingStories, setPublishingStories] = useState<Set<string>>(new Set());
  const [deletingQueueItems, setDeletingQueueItems] = useState<Set<string>>(new Set());
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const { toast } = useToast();
  
  const handlePreviewArticle = async (article: any) => {
    if (!article) return;
    setPreviewArticle(article);
    setLoadingPreview(true);
    try {
      if (article.shared_content_id) {
        const { data, error } = await supabase
          .from('shared_article_content')
          .select('body')
          .eq('id', article.shared_content_id)
          .single();
        if (!error && data?.body) {
          setPreviewArticle((prev: any) => ({ ...prev, body: data.body }));
        }
      }
    } catch (error) {
      console.error('Error fetching article body:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  const [runningPublishMigration, setRunningPublishMigration] = useState(false);

  const {
    articles,
    queueItems,
    stories,
    loading,
    loadingMore,
    stats,
    duplicateMap,
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
    clearNewPublished,
    hasMoreArticles,
    totalArticlesCount,
    loadMoreArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  const multiTenantActions = useMultiTenantActions();
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());

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
        toast({ title: "Error", description: "Failed to load topics", variant: "destructive" });
      }
    };
    loadTopics();
  }, []);

  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  const currentTopic = topics.find(t => t.id === selectedTopicId);

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

  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({ ...prev, [articleId]: quantity }));
  };

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined) => {
    setToneOverrides(prev => ({ ...prev, [articleId]: tone }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined) => {
    setWritingStyleOverrides(prev => ({ ...prev, [articleId]: style }));
  };

  const handleToggleStoryExpanded = (storyId: string) => {
    setExpandedStories(prev => {
      const newSet = new Set(prev);
      newSet.has(storyId) ? newSet.delete(storyId) : newSet.add(storyId);
      return newSet;
    });
  };

  const handleStoryApprove = async (storyId: string) => {
    setProcessingApproval(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantApproveStory(storyId);
      toast({ title: "Story Approved", description: "Story approved and published" });
    } catch (error) {
      console.error('Error approving story:', error);
      toast({ title: "Error", description: "Failed to approve story", variant: "destructive" });
    } finally {
      setProcessingApproval(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const handleStoryReject = async (storyId: string) => {
    setProcessingRejection(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantRejectStory(storyId);
      await refreshContent();
      toast({ title: "Story Rejected", description: "Story has been rejected and returned to Arrivals" });
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({ title: "Error", description: "Failed to reject story", variant: "destructive" });
    } finally {
      setProcessingRejection(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      await handleMultiTenantRejectStory(storyId);
    } catch (error) {
      console.error('Error returning story to review:', error);
    }
  };

  const handleArchiveStory = async (storyId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'archived', is_published: false, updated_at: new Date().toISOString() })
        .eq('id', storyId);
      if (error) throw error;
      toast({ title: "Success", description: `Story "${title}" archived successfully` });
      refreshContent();
    } catch (error) {
      console.error('Error archiving story:', error);
      toast({ title: "Error", description: "Failed to archive story", variant: "destructive" });
    }
  };

  const handleViewStory = (story: any) => {
    if (story.id && topicSlug) {
      window.open(`/feed/${topicSlug}/story/${story.id}`, '_blank');
    } else if (story.id) {
      window.open(`/story/${story.id}`, '_blank');
    }
  };

  const runPublishMigration = useCallback(async () => {
    try {
      setRunningPublishMigration(true);
      const { data, error } = await supabase.functions.invoke('publish-ready-stories', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to publish ready stories');
      toast({ title: 'Published', description: data.message || 'Converted ready stories to published' });
      await refreshContent();
    } catch (err: any) {
      console.error('Publish migration failed:', err);
      toast({ title: 'Migration failed', description: err.message || 'Could not publish ready stories', variant: 'destructive' });
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

  const highlightContentWithContext = (
    text: string, 
    regionName: string,
    landmarks: string[],
    keywords: string[],
    organizations: string[]
  ) => {
    if (!text) return '';
    const escapeHtml = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    let highlightedText = escapeHtml(text);
    const createRegex = (term: string) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const useWordBoundaries = /^[\w-]+$/.test(term.trim());
      const boundary = useWordBoundaries ? '\\b' : '';
      return new RegExp(`${boundary}(${escaped})${boundary}`, 'gi');
    };
    if (regionName) {
      highlightedText = highlightedText.replace(createRegex(regionName), '<mark class="bg-green-200 text-green-900 px-1.5 py-0.5 rounded font-bold border-2 border-green-500">$1</mark>');
    }
    landmarks.forEach(l => { if (l?.trim()) highlightedText = highlightedText.replace(createRegex(l), '<mark class="bg-blue-200 text-blue-900 px-1 rounded font-semibold border border-blue-400">$1</mark>'); });
    organizations.forEach(o => { if (o?.trim()) highlightedText = highlightedText.replace(createRegex(o), '<mark class="bg-purple-200 text-purple-900 px-1 rounded border border-purple-300">$1</mark>'); });
    keywords.forEach(k => { if (k?.trim()) highlightedText = highlightedText.replace(createRegex(k), '<mark class="bg-yellow-100 text-yellow-800 px-1 rounded">$1</mark>'); });
    return highlightedText;
  };

  return (
    <div className="space-y-4">
      {/* Two-tab pipeline */}
      <Tabs defaultValue="articles" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="articles" className="relative">
            <div className="flex items-center gap-2">
              <span>Arrivals ({totalArticles})</span>
              <NewContentBadge show={newArrivals} onDismiss={clearNewArrivals} />
            </div>
          </TabsTrigger>
          <TabsTrigger value="published">
            <div className="flex items-center gap-2">
              <span>Published</span>
              {queueItems.length > 0 && (
                <span className="inline-flex items-center gap-1 text-primary animate-fade-in">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">{queueItems.length}</span>
                </span>
              )}
              <NewContentBadge show={newPublished} onDismiss={clearNewPublished} />
            </div>
          </TabsTrigger>
        </TabsList>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-3">
          {totalArticles === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No new arrivals</p>
              <p className="text-sm mt-2">
                New articles appear here when scraped.
              </p>
            </div>
          ) : (
            <MultiTenantArticlesList
              articles={articles}
              processingArticle={processingArticle}
              deletingArticles={deletingArticles}
              animatingArticles={animatingArticles}
              duplicateMap={duplicateMap}
              slideQuantityOverrides={slideQuantities}
              toneOverrides={toneOverrides}
              writingStyleOverrides={writingStyleOverrides}
              onSlideQuantityChange={handleSlideQuantityChange}
              onToneOverrideChange={handleToneOverrideChange}
              onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
              onPreview={handlePreviewArticle}
              onApprove={(article, slideType, tone, writingStyle, generateIllustration) => 
                handleMultiTenantApprove(article, slideType, tone, writingStyle, generateIllustration)
              }
              onDelete={handleMultiTenantDelete}
              onBulkDelete={handleMultiTenantBulkDelete}
              onPromote={promoteTopicArticle}
              defaultTone={currentTopic?.default_tone || 'conversational'}
              defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
              onRefresh={refreshContent}
              hasMoreArticles={hasMoreArticles}
              totalArticlesCount={totalArticlesCount}
              loadingMore={loadingMore}
              onLoadMore={loadMoreArticles}
            />
          )}
        </TabsContent>

        {/* Published Tab */}
        <TabsContent value="published" className="space-y-3">
          <div className="flex justify-end items-center gap-2 mb-2">
            {stuckCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('auto-recover-stuck-stories');
                    if (error) throw error;
                    toast({ title: "Recovery Triggered", description: `Recovered ${data?.totalRecovered || 0} stuck items` });
                    refreshContent();
                  } catch (error) {
                    toast({ title: "Recovery Failed", description: error instanceof Error ? error.message : "Failed to recover stuck items", variant: "destructive" });
                  }
                }}
                className="text-destructive border-destructive/50 hover:bg-destructive/10 h-7 text-xs"
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                Recover {stuckCount} stuck
              </Button>
            )}
          </div>
          
          {stories.filter(s => ['ready', 'published'].includes(s.status)).length === 0 && queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No published stories</p>
              <p className="text-sm mt-2">Approved stories will appear here when published to the feed</p>
            </div>
          ) : (
            <PublishedStoriesList 
              stories={stories.filter(s => ['ready', 'published'].includes(s.status))}
              processingItems={queueItems}
              onArchive={handleArchiveStory}
              onReturnToReview={handleMultiTenantRejectStory}
              onDelete={handleMultiTenantRejectStory}
              onViewStory={handleViewStory}
              onCancelProcessing={handleMultiTenantCancelQueue}
              onRefresh={refreshContent}
              loading={loading}
              topicSlug={topicSlug}
              topicId={selectedTopicId}
            />
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
            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-green-200 border-2 border-green-500 rounded font-bold flex items-center justify-center text-[8px]">R</div>
                <span className="text-xs font-semibold text-green-700">Region Name</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-blue-200 border border-blue-400 rounded font-semibold flex items-center justify-center text-[8px]">L</div>
                <span className="text-xs font-medium text-blue-700">Landmarks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-purple-200 border border-purple-300 rounded flex items-center justify-center text-[8px]">O</div>
                <span className="text-xs font-medium text-purple-700">Organizations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-yellow-100 rounded flex items-center justify-center text-[8px]">K</div>
                <span className="text-xs text-muted-foreground">Keywords</span>
              </div>
            </div>

            {previewArticle?.title && (
              <div className="border-b pb-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1">HEADLINE</div>
                <div
                  className="text-lg font-semibold leading-tight"
                  dangerouslySetInnerHTML={{
                    __html: highlightContentWithContext(
                      previewArticle.title,
                      currentTopic?.name || '',
                      currentTopic?.landmarks || [],
                      currentTopic?.keywords || [],
                      currentTopic?.organizations || []
                    )
                  }}
                />
              </div>
            )}

            {loadingPreview && !previewArticle?.body && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading article content...</span>
              </div>
            )}
            {previewArticle?.body && (
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-amber-200 via-green-300 to-amber-200 rounded-l"></div>
                <div className="prose max-w-none">
                  <div
                    className="min-h-[300px] whitespace-pre-wrap text-sm leading-relaxed border rounded-md p-4 pl-6 bg-muted/30"
                    dangerouslySetInnerHTML={{
                      __html: highlightContentWithContext(
                        previewArticle.body,
                        currentTopic?.name || '',
                        currentTopic?.landmarks || [],
                        currentTopic?.keywords || [],
                        currentTopic?.organizations || []
                      )
                    }}
                  />
                </div>
              </div>
            )}
            {!loadingPreview && !previewArticle?.body && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No article body available for preview.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
