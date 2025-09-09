import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCw, 
  Loader2,
  Eye,
  ExternalLink,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { useTopicPipelineActions } from "@/hooks/useTopicPipelineActions";
import { useMultiTenantTopicPipeline } from "@/hooks/useMultiTenantTopicPipeline";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
}

interface UnifiedContentPipelineProps {
  selectedTopicId?: string;
}

export const UnifiedContentPipeline: React.FC<UnifiedContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [topics, setTopics] = useState<Topic[]>([]);
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
          .select('id, name, topic_type, is_active')
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

  const handleLegacyApprove = async (articleId: string) => {
    try {
      await approveArticle(articleId, 'tabloid', 'conversational', 'journalistic');
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
    try {
      await handleMultiTenantApprove(articleId, 'tabloid', 'conversational', 'journalistic');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {currentTopic?.name || 'Content Pipeline'}
                <Badge variant="outline">{currentTopic?.topic_type}</Badge>
              </CardTitle>
              <CardDescription>
                Unified view of all content across both legacy and multi-tenant systems
              </CardDescription>
            </div>
            <Button 
              onClick={refreshAll} 
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh All
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArticles}</div>
            <p className="text-xs text-muted-foreground">
              {legacyArticles.length} Legacy + {multiTenantArticles.length} Multi-tenant
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Processing Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQueue}</div>
            <p className="text-xs text-muted-foreground">
              {legacyQueue.length} Legacy + {multiTenantQueue.length} Multi-tenant
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ready Stories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStories}</div>
            <p className="text-xs text-muted-foreground">
              {legacyStories.length} Legacy + {multiTenantStories.length} Multi-tenant
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Legacy</Badge>
              <Badge variant="default">Multi-tenant</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="stories" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stories">
            Stories ({totalStories})
          </TabsTrigger>
          <TabsTrigger value="articles">
            Articles ({totalArticles})
          </TabsTrigger>
          <TabsTrigger value="queue">
            Processing ({totalQueue})
          </TabsTrigger>
        </TabsList>

        {/* Stories Tab - Most Important */}
        <TabsContent value="stories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Published Stories</CardTitle>
              <CardDescription>All ready stories from both systems</CardDescription>
            </CardHeader>
            <CardContent>
              {totalStories === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No stories available yet</p>
                  <p className="text-sm mt-2">Approve some articles to generate stories</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Legacy Stories */}
                  {legacyStories.map((story) => (
                    <div key={story.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{story.title}</h3>
                            <Badge variant="secondary">Legacy</Badge>
                            <Badge 
                              variant={story.status === 'ready' ? 'default' : 'outline'}
                            >
                              {story.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {story.slides?.length || 0} slides • Created {new Date(story.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {story.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => approveStory(story.id)}
                                disabled={processingArticle === story.id}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectStory(story.id)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteStory(story.id, story.title)}
                          disabled={false}
                        >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Multi-tenant Stories */}
                  {multiTenantStories.map((story) => (
                    <div key={story.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{story.title}</h3>
                            <Badge variant="default">Multi-tenant</Badge>
                            <Badge 
                              variant={story.status === 'ready' ? 'default' : 'outline'}
                            >
                              {story.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {story.slides?.length || 0} slides • Created {new Date(story.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {story.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleMultiTenantApproveStory(story.id)}
                                disabled={mtProcessingArticle === story.id}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleMultiTenantRejectStory(story.id)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Articles Tab */}
        <TabsContent value="articles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Articles</CardTitle>
              <CardDescription>Articles ready for approval from both systems</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Legacy Articles */}
                {legacyArticles.map((article) => (
                  <div key={article.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium line-clamp-1">{article.title}</h3>
                          <Badge variant="secondary">Legacy</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Quality: {article.content_quality_score || 0} • 
                          Relevance: {article.regional_relevance_score || 0} • 
                          {article.word_count || 0} words
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(article.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleLegacyApprove(article.id)}
                          disabled={processingArticle === article.id}
                        >
                          {processingArticle === article.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Source
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteArticle(article.id, article.title)}
                          disabled={false}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Multi-tenant Articles */}
                {multiTenantArticles.map((article) => (
                  <div key={article.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium line-clamp-1">{article.title}</h3>
                          <Badge variant="default">Multi-tenant</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Quality: {article.content_quality_score || 0} • 
                          Relevance: {article.regional_relevance_score || 0} • 
                          {article.word_count || 0} words
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(article.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleMultiTenantApproveWrapper(article.id)}
                          disabled={mtProcessingArticle === article.id}
                        >
                          {mtProcessingArticle === article.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Source
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleMultiTenantDelete(article.id, article.title)}
                          disabled={false}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {totalArticles === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No articles pending approval</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Processing Queue</CardTitle>
              <CardDescription>Articles currently being processed into stories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Legacy Queue */}
                {legacyQueue.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{item.article.title}</h4>
                          <Badge variant="secondary">Legacy</Badge>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Attempt {item.attempts}/{item.max_attempts} • 
                          Started {new Date(item.created_at).toLocaleDateString()}
                        </p>
                        {item.error_message && (
                          <p className="text-sm text-destructive mt-1">{item.error_message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Source
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Multi-tenant Queue */}
                {multiTenantQueue.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{item.title}</h4>
                          <Badge variant="default">Multi-tenant</Badge>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Attempt {item.attempts}/{item.max_attempts} • 
                          Started {new Date(item.created_at).toLocaleDateString()}
                        </p>
                        {item.error_message && (
                          <p className="text-sm text-destructive mt-1">{item.error_message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Source
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {totalQueue === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No items in processing queue</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};