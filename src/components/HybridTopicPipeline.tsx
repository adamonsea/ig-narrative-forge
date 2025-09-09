import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  BarChart3, 
  RefreshCw, 
  Loader2,
  Database,
  Layers,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";

// Legacy hooks and components
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { useTopicPipelineActions } from "@/hooks/useTopicPipelineActions";
import { ArticlesList } from "./topic-pipeline/ArticlesList";
import { QueueList } from "./topic-pipeline/QueueList";

// Multi-tenant hooks and components
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { MultiTenantArticlesList } from "./topic-pipeline/MultiTenantArticlesList";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  default_tone?: 'formal' | 'conversational' | 'engaging';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  audience_expertise?: 'beginner' | 'intermediate' | 'expert';
  keywords?: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
}

interface HybridTopicPipelineProps {
  selectedTopicId?: string;
  topic?: Topic;
}

export const HybridTopicPipeline: React.FC<HybridTopicPipelineProps> = ({ 
  selectedTopicId: propTopicId,
  topic 
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [slideQuantities, setSlideQuantities] = useState<{ [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' }>({});
  const [toneOverrides, setToneOverrides] = useState<{ [key: string]: 'formal' | 'conversational' | 'engaging' }>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<{ [key: string]: 'journalistic' | 'educational' | 'listicle' | 'story_driven' }>({});
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'legacy' | 'multi-tenant'>('legacy');
  const { toast } = useToast();
  const { user } = useAuth();

  // Legacy pipeline hook
  const {
    articles: legacyArticles,
    queueItems: legacyQueueItems,
    stories: legacyStories,
    loading: legacyLoading,
    stats: legacyStats,
    loadTopicContent: loadLegacyContent,
    getAutoSlideType,
    optimisticallyRemoveArticle
  } = useTopicPipeline(selectedTopicId);

  // Multi-tenant pipeline hook
  const {
    articles: multiTenantArticles,
    queueItems: multiTenantQueueItems,
    stories: multiTenantStories,
    loading: multiTenantLoading,
    stats: multiTenantStats,
    loadTopicContent: loadMultiTenantContent,
    testMigration,
    migrateTopicArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Legacy actions hook
  const {
    processingArticle,
    processingApproval,
    processingRejection,
    deletingStories,
    deletingQueueItems,
    deletingArticles,
    animatingArticles,
    animatingStories,
    approveArticle,
    approveStory,
    rejectStory,
    returnToReview,
    deleteStory,
    cancelQueueItem,
    deleteArticle
  } = useTopicPipelineActions(loadLegacyContent, optimisticallyRemoveArticle);

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  // Initialize slide quantities with auto-selected values
  useEffect(() => {
    if (legacyArticles.length > 0) {
      const newSlideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' } = {};
      let hasNewQuantities = false;
      
      legacyArticles.forEach(article => {
        if (!slideQuantities[article.id]) {
          newSlideQuantities[article.id] = getAutoSlideType(article.word_count || 0);
          hasNewQuantities = true;
        }
      });
      
      if (hasNewQuantities) {
        setSlideQuantities(prev => ({ ...prev, ...newSlideQuantities }));
      }
    }
  }, [legacyArticles, getAutoSlideType]);

  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({
      ...prev,
      [articleId]: quantity
    }));
  };

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => {
    setToneOverrides(prev => ({
      ...prev,
      [articleId]: tone
    }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => {
    setWritingStyleOverrides(prev => ({
      ...prev,
      [articleId]: style
    }));
  };

  const handleLegacyApprove = (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' | 'extensive', tone: 'formal' | 'conversational' | 'engaging', writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => {
    approveArticle(articleId, slideType, tone, writingStyle);
  };

  const handleMultiTenantApprove = async (articleId: string) => {
    // TODO: Implement multi-tenant approval workflow
    toast({
      title: "Multi-Tenant Approval",
      description: "Multi-tenant article approval workflow coming soon!",
      variant: "default"
    });
  };

  const handleMultiTenantDelete = async (articleId: string, articleTitle: string) => {
    // TODO: Implement multi-tenant deletion
    toast({
      title: "Multi-Tenant Delete",
      description: "Multi-tenant article deletion workflow coming soon!",
      variant: "default"
    });
  };

  const handleRefresh = () => {
    if (viewMode === 'legacy') {
      loadLegacyContent();
    } else {
      loadMultiTenantContent();
    }
  };

  const isLoading = viewMode === 'legacy' ? legacyLoading : multiTenantLoading;
  const currentStats = viewMode === 'legacy' ? legacyStats : multiTenantStats;

  return (
    <div className="space-y-6">
      {/* Pipeline Header with Mode Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Content Pipeline
                {viewMode === 'multi-tenant' && (
                  <Badge variant="outline" className="bg-blue-100 text-blue-800">
                    Multi-Tenant Mode
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {viewMode === 'legacy' 
                  ? "Legacy article management system" 
                  : "New multi-tenant architecture with shared content"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                disabled={isLoading}
                variant="outline"
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mode Selection Tabs */}
          <Tabs value={viewMode} onValueChange={(value: 'legacy' | 'multi-tenant') => setViewMode(value)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="legacy" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Legacy Articles ({legacyArticles.length})
              </TabsTrigger>
              <TabsTrigger value="multi-tenant" className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Multi-Tenant ({multiTenantStats.totalArticles})
              </TabsTrigger>
            </TabsList>

            {/* Legacy View */}
            <TabsContent value="legacy" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-chart-2" />
                      <div>
                        <div className="text-2xl font-bold text-chart-2">{legacyStats.pending_articles}</div>
                        <p className="text-sm text-muted-foreground">Pending</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 text-chart-3" />
                      <div>
                        <div className="text-2xl font-bold text-chart-3">{legacyStats.processing_queue}</div>
                        <p className="text-sm text-muted-foreground">Processing</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-chart-1" />
                      <div>
                        <div className="text-2xl font-bold text-chart-1">{legacyStats.ready_stories}</div>
                        <p className="text-sm text-muted-foreground">Ready</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-chart-4" />
                      <div>
                        <div className="text-2xl font-bold text-chart-4">{legacyArticles.length}</div>
                        <p className="text-sm text-muted-foreground">Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="articles" className="space-y-4">
                <TabsList className="w-full">
                  <TabsTrigger value="articles" className="flex-1">
                    Articles ({legacyArticles.length})
                  </TabsTrigger>
                  <TabsTrigger value="queue" className="flex-1">
                    Queue ({legacyQueueItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="stories" className="flex-1">
                    Stories ({legacyStories.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="articles">
                  <ArticlesList
                    articles={legacyArticles}
                    processingArticle={processingArticle}
                    slideQuantities={slideQuantities}
                    deletingArticles={deletingArticles}
                    animatingArticles={animatingArticles}
                    toneOverrides={toneOverrides}
                    writingStyleOverrides={writingStyleOverrides}
                    onSlideQuantityChange={handleSlideQuantityChange}
                    onToneOverrideChange={handleToneOverrideChange}
                    onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                    onApprove={handleLegacyApprove}
                    onPreview={setPreviewArticle}
                    onDelete={deleteArticle}
                    defaultTone={topic?.default_tone || 'conversational'}
                    defaultWritingStyle={topic?.default_writing_style || 'journalistic'}
                    topicKeywords={topic?.keywords}
                    topicLandmarks={topic?.landmarks}
                    onRefresh={handleRefresh}
                  />
                </TabsContent>

                <TabsContent value="queue">
                  <QueueList
                    queueItems={legacyQueueItems}
                    deletingQueueItems={deletingQueueItems}
                    onCancel={cancelQueueItem}
                    onRetry={cancelQueueItem}
                  />
                </TabsContent>

                <TabsContent value="stories">
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <div className="space-y-2">
                        <p>Legacy Stories: {legacyStories.length}</p>
                        <p className="text-sm">Full stories management interface will be added in Phase 2</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Multi-Tenant View */}
            <TabsContent value="multi-tenant" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-chart-2" />
                      <div>
                        <div className="text-2xl font-bold text-chart-2">{multiTenantStats.pendingArticles}</div>
                        <p className="text-sm text-muted-foreground">Pending</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 text-chart-3" />
                      <div>
                        <div className="text-2xl font-bold text-chart-3">{multiTenantStats.processingQueue}</div>
                        <p className="text-sm text-muted-foreground">Processing</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-chart-1" />
                      <div>
                        <div className="text-2xl font-bold text-chart-1">{multiTenantStats.readyStories}</div>
                        <p className="text-sm text-muted-foreground">Ready</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-chart-4" />
                      <div>
                        <div className="text-2xl font-bold text-chart-4">{multiTenantStats.totalArticles}</div>
                        <p className="text-sm text-muted-foreground">Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <MultiTenantArticlesList
                articles={multiTenantArticles}
                processingArticle={processingArticle}
                deletingArticles={deletingArticles}
                slideQuantities={{}}
                toneOverrides={{}}
                writingStyleOverrides={{}}
                onSlideQuantityChange={() => {}}
                onToneOverrideChange={() => {}}
                onWritingStyleOverrideChange={() => {}}
                onPreview={(article: MultiTenantArticle) => setPreviewArticle(article)}
                onApprove={handleMultiTenantApprove}
                onDelete={handleMultiTenantDelete}
                onBulkDelete={() => {}}
                defaultTone="conversational"
                defaultWritingStyle="journalistic"
                topicKeywords={topic?.keywords}
                topicLandmarks={topic?.landmarks}
                onRefresh={() => {}}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{previewArticle?.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <span>Preview article content</span>
              {'shared_content_id' in (previewArticle || {}) && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800">
                  Multi-Tenant
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewArticle?.body && (
              <div>
                <h4 className="font-medium mb-2">Content</h4>
                <Textarea
                  value={previewArticle.body}
                  readOnly
                  className="min-h-[300px] resize-none"
                />
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              <p>Source: <a href={previewArticle?.source_url || previewArticle?.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{previewArticle?.source_url || previewArticle?.url}</a></p>
              {previewArticle?.author && <p>Author: {previewArticle.author}</p>}
              <p>Word Count: {previewArticle?.word_count || 0}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};