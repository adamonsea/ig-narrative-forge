import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  RefreshCw, 
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import CarouselImageViewer from '@/components/CarouselImageViewer';
import { Textarea } from "@/components/ui/textarea";
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { useTopicPipelineActions } from "@/hooks/useTopicPipelineActions";
import { ArticlesList } from "./topic-pipeline/ArticlesList";
import { QueueList } from "./topic-pipeline/QueueList";
import { StoriesList } from "./topic-pipeline/StoriesList";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
}

interface Article {
  id: string;
  title: string;
  body: string;
  source_url: string;
  published_at: string | null;
  created_at: string;
  processing_status: string;
  content_quality_score: number | null;
  regional_relevance_score: number | null;
  word_count: number | null;
  author?: string;
  summary?: string;
  import_metadata?: any;
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface TopicAwareContentPipelineProps {
  selectedTopicId?: string;
}

export const TopicAwareContentPipeline: React.FC<TopicAwareContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [slideQuantities, setSlideQuantities] = useState<{ [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' }>({});
  const [aiProvider, setAiProvider] = useState<'openai' | 'deepseek'>('openai');
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [viewingStory, setViewingStory] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    articles,
    queueItems,
    stories,
    loading,
    stats,
    loadTopicContent,
    getAutoSlideType
  } = useTopicPipeline(selectedTopicId);

  const {
    processingArticle,
    processingApproval,
    processingRejection,
    deletingStories,
    deletingQueueItems,
    deletingArticles,
    approveArticle,
    approveStory,
    rejectStory,
    returnToReview,
    deleteStory,
    cancelQueueItem,
    deleteArticle
  } = useTopicPipelineActions(loadTopicContent);

  // Initialize slide quantities with auto-selected values
  useEffect(() => {
    if (articles.length > 0) {
      const newSlideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' } = {};
      articles.forEach(article => {
        if (!slideQuantities[article.id]) {
          newSlideQuantities[article.id] = getAutoSlideType(article.word_count || 0);
        }
      });
      if (Object.keys(newSlideQuantities).length > 0) {
        setSlideQuantities(prev => ({ ...prev, ...newSlideQuantities }));
      }
    }
  }, [articles]);

  // Set up real-time subscriptions for pipeline updates
  useEffect(() => {
    if (!selectedTopicId) return;

    const channel = supabase
      .channel('topic-pipeline-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        () => {
          console.log('Article updated, refreshing content...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public', 
          table: 'content_generation_queue'
        },
        () => {
          console.log('Queue updated, refreshing content...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          console.log('Stories updated, refreshing content...');
          loadTopicContent();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, loadTopicContent]);

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    if (selectedTopicId) {
      loadTopicContent();
    }
  }, [selectedTopicId]);

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

  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({
      ...prev,
      [articleId]: quantity
    }));
  };

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setEditContent(slide.content);
  };

  const handleSaveSlide = async () => {
    if (!editingSlide) return;

    try {
      const { error } = await supabase
        .from('slides')
        .update({ content: editContent })
        .eq('id', editingSlide.id);

      if (error) throw error;

      toast({
        title: "Slide Updated",
        description: "Slide content has been saved"
      });

      setEditingSlide(null);
      setEditContent('');
      loadTopicContent();
    } catch (error) {
      console.error('Error updating slide:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update slide content",
        variant: "destructive"
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
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

  // Debug logging
  console.log('TopicAwareContentPipeline render:', { 
    user: !!user, 
    selectedTopicId, 
    propTopicId, 
    loading, 
    articlesCount: articles.length,
    stats 
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Please sign in to access the content pipeline.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic Selection */}
      {!propTopicId && (
        <Card>
          <CardHeader>
            <CardTitle>Select Topic</CardTitle>
            <CardDescription>Choose a topic to manage its content pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label htmlFor="topic-select">Topic:</Label>
              <Select 
                value={selectedTopicId} 
                onValueChange={setSelectedTopicId}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a topic" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name} ({topic.topic_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedTopicId && (
        <>
          {/* Combined Dashboard - Stats and AI Provider */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-chart-2" />
                  <div>
                    <div className="text-2xl font-bold text-chart-2">{stats.pending_articles}</div>
                    <p className="text-sm text-muted-foreground">Pending Articles</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 text-chart-3" />
                  <div>
                    <div className="text-2xl font-bold text-chart-3">{stats.processing_queue}</div>
                    <p className="text-sm text-muted-foreground">Processing Queue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-chart-1" />
                  <div>
                    <div className="text-2xl font-bold text-chart-1">{stats.ready_stories}</div>
                    <p className="text-sm text-muted-foreground">Ready Stories</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">AI Provider</Label>
                  <Select value={aiProvider} onValueChange={(value: 'openai' | 'deepseek') => setAiProvider(value)}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content Pipeline Tabs */}
          <Tabs defaultValue="articles" className="space-y-6">
            <TabsList className="grid w-full mobile-tabs">
              <TabsTrigger value="articles">
                Pending Articles ({stats.pending_articles})
              </TabsTrigger>
              <TabsTrigger value="queue">
                Processing Queue ({stats.processing_queue})
              </TabsTrigger>
              <TabsTrigger value="stories">
                Ready Stories ({stats.ready_stories})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="articles" className="space-y-6">
              <div className="flex justify-end items-center">
                <Button onClick={loadTopicContent} disabled={loading}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>

              <ArticlesList
                articles={articles}
                processingArticle={processingArticle}
                slideQuantities={slideQuantities}
                deletingArticles={deletingArticles}
                onSlideQuantityChange={handleSlideQuantityChange}
                onApprove={(articleId, slideType) => approveArticle(articleId, slideType, aiProvider)}
                onPreview={(article) => setPreviewArticle(article)}
                onDelete={deleteArticle}
              />
            </TabsContent>

            <TabsContent value="queue" className="space-y-6">
              <QueueList
                queueItems={queueItems}
                deletingQueueItems={deletingQueueItems}
                onCancel={cancelQueueItem}
                onRetry={(queueId) => console.log('Retry not implemented yet')}
              />
            </TabsContent>

            <TabsContent value="stories" className="space-y-6">
              <StoriesList
                stories={stories}
                expandedStories={expandedStories}
                processingApproval={processingApproval}
                processingRejection={processingRejection}
                deletingStories={deletingStories}
                publishingStories={new Set()}
                onToggleExpanded={toggleStoryExpanded}
                onApprove={approveStory}
                onReject={rejectStory}
                onDelete={deleteStory}
                onReturnToReview={returnToReview}
                onEditSlide={handleEditSlide}
                onViewStory={setViewingStory}
              />
            </TabsContent>
          </Tabs>

          {/* View Story Dialog */}
          <Dialog open={!!viewingStory} onOpenChange={() => setViewingStory(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{viewingStory?.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-2">Story Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span>
                      <Badge variant={viewingStory?.status === 'ready' ? 'default' : 'secondary'} className="ml-2">
                        {viewingStory?.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span> {viewingStory ? new Date(viewingStory.created_at).toLocaleString() : ''}
                    </div>
                    <div>
                      <span className="font-medium">Author:</span> {viewingStory?.author || 'Unknown'}
                    </div>
                    <div>
                      <span className="font-medium">Publication:</span> {viewingStory?.publication_name || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Slides ({viewingStory?.slides?.length || 0})</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {viewingStory?.slides?.map((slide: any, index: number) => (
                      <div key={slide.id} className="p-3 bg-muted rounded-lg">
                        <div className="font-medium text-sm mb-1">Slide {index + 1}</div>
                        <p className="text-sm">{slide.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {viewingStory?.status === 'ready' && (
                  <CarouselImageViewer 
                    storyId={viewingStory.id} 
                    storyTitle={viewingStory.title}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Slide Dialog */}
          <Dialog open={!!editingSlide} onOpenChange={() => setEditingSlide(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Slide Content</DialogTitle>
                <DialogDescription>
                  Modify the content for slide {editingSlide?.slide_number}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  placeholder="Enter slide content..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingSlide(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSlide}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Article Preview Dialog */}
          <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{previewArticle?.title}</DialogTitle>
                <DialogDescription>
                  Article preview - {previewArticle?.word_count} words
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p><strong>Author:</strong> {previewArticle?.author || 'Unknown'}</p>
                  <p><strong>Published:</strong> {previewArticle?.published_at ? new Date(previewArticle.published_at).toLocaleDateString() : 'Unknown'}</p>
                  <p><strong>Source:</strong> <a href={previewArticle?.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{previewArticle?.source_url}</a></p>
                </div>
                <div className="prose max-w-none">
                  <div className="whitespace-pre-wrap">{previewArticle?.body}</div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};