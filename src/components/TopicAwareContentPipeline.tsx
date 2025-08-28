import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, Clock, CheckCircle, AlertCircle, BarChart3, ExternalLink, Sparkles, XCircle, RefreshCw, Eye, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

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

interface QueueItem {
  id: string;
  status: string;
  created_at: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  article: {
    title: string;
    source_url: string;
  };
}

interface Story {
  id: string;
  title: string;
  status: string;
  created_at: string;
  is_published: boolean;
  article: {
    title: string;
    source_url: string;
  };
  slides: Array<{
    id: string;
    content: string;
    slide_number: number;
  }>;
}

export const TopicAwareContentPipeline = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'deepseek'>('deepseek');
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [editingSlideContent, setEditingSlideContent] = useState('');
  const [editingSlideId, setEditingSlideId] = useState('');
  const [stats, setStats] = useState({
    pending_articles: 0,
    processing_queue: 0,
    ready_stories: 0
  });
  const { toast } = useToast();
  const { user } = useAuth();

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

      if (data && data.length > 0 && !selectedTopicId) {
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

  const loadTopicContent = async () => {
    if (!selectedTopicId) return;

    try {
      setLoading(true);

      // Load pending articles for this topic
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'new')
        .order('created_at', { ascending: false })
        .limit(20);

      if (articlesError) throw articlesError;

      // Load content generation queue for this topic
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          *,
          articles!inner(
            title,
            source_url,
            topic_id
          )
        `)
        .eq('articles.topic_id', selectedTopicId)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (queueError) throw queueError;

      // Load ready stories for this topic
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select(`
          *,
          articles!inner(
            title,
            source_url,
            topic_id
          ),
          slides(
            id,
            content,
            slide_number
          )
        `)
        .eq('articles.topic_id', selectedTopicId)
        .in('status', ['ready', 'draft'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (storiesError) throw storiesError;

      setArticles(articlesData || []);
      setQueueItems((queueData || []).map(item => ({
        id: item.id,
        status: item.status,
        created_at: item.created_at,
        attempts: item.attempts,
        max_attempts: item.max_attempts,
        error_message: item.error_message,
        article: {
          title: item.articles.title,
          source_url: item.articles.source_url
        }
      })));
      setStories((storiesData || []).map(story => ({
        id: story.id,
        title: story.title,
        status: story.status,
        created_at: story.created_at,
        is_published: story.is_published || false,
        article: {
          title: story.articles.title,
          source_url: story.articles.source_url
        },
        slides: story.slides.sort((a, b) => a.slide_number - b.slide_number)
      })));

      // Update stats
      setStats({
        pending_articles: articlesData?.length || 0,
        processing_queue: queueData?.filter(q => q.status === 'processing').length || 0,
        ready_stories: storiesData?.length || 0
      });

    } catch (error) {
      console.error('Error loading topic content:', error);
      toast({
        title: "Error",
        description: "Failed to load content for this topic",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const approveArticle = async (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' = 'tabloid') => {
    try {
      setProcessingArticle(articleId);
      
      const { data: queueJob, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: articleId,
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
        title: "Success",
        description: `${typeLabels[slideType]} generation with ${providerLabels[selectedProvider]} queued for processing`
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error approving article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
        variant: "destructive"
      });
    } finally {
      setProcessingArticle(null);
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
        
        toast({
          title: 'Content Extracted Successfully',
          description: `Extracted${wordCountChange} using ${data.extractionMethod || 'direct'} method.`,
        });
        
        loadTopicContent();
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

  const toggleStoryPublication = async (storyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ is_published: !currentStatus })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Story ${!currentStatus ? 'published' : 'unpublished'} successfully`
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error updating story publication status:', error);
      toast({
        title: "Error",
        description: "Failed to update publication status",
        variant: "destructive"
      });
    }
  };

  const saveSlideEdit = async () => {
    if (!editingSlideId || !editingSlideContent.trim()) return;

    try {
      const { error } = await supabase
        .from('slides')
        .update({ content: editingSlideContent.trim() })
        .eq('id', editingSlideId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Slide content updated successfully"
      });

      setEditingStory(null);
      setEditingSlideContent('');
      setEditingSlideId('');
      loadTopicContent();
    } catch (error) {
      console.error('Error updating slide:', error);
      toast({
        title: "Error",
        description: "Failed to update slide content",
        variant: "destructive"
      });
    }
  };

  const reprocessQueueItem = async (queueId: string) => {
    try {
      const { error } = await supabase
        .from('content_generation_queue')
        .update({ 
          status: 'pending',
          attempts: 0,
          error_message: null
        })
        .eq('id', queueId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Queue item reset for reprocessing"
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error reprocessing queue item:', error);
      toast({
        title: "Error",
        description: "Failed to reprocess queue item",
        variant: "destructive"
      });
    }
  };

  const currentTopic = topics.find(t => t.id === selectedTopicId);

  return (
    <div className="space-y-6">
      {/* Topic Selection & Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Content Pipeline</CardTitle>
          <CardDescription>
            Manage content processing pipeline for your topics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline-topic-select">Select Topic</Label>
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a topic to view pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant={topic.topic_type === 'regional' ? 'default' : 'secondary'}>
                          {topic.topic_type}
                        </Badge>
                        {topic.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ai-provider-select">AI Provider</Label>
              <Select value={selectedProvider} onValueChange={(value: 'openai' | 'deepseek') => setSelectedProvider(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose AI provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      DeepSeek
                    </div>
                  </SelectItem>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      OpenAI
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {currentTopic && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.pending_articles}</div>
                <div className="text-sm text-muted-foreground">Pending Articles</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.processing_queue}</div>
                <div className="text-sm text-muted-foreground">Processing Queue</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.ready_stories}</div>
                <div className="text-sm text-muted-foreground">Ready Stories</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Content */}
      {selectedTopicId && (
        <Tabs defaultValue="articles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="articles">
              Pending Articles ({stats.pending_articles})
            </TabsTrigger>
            <TabsTrigger value="queue">
              Processing Queue ({queueItems.length})
            </TabsTrigger>
            <TabsTrigger value="stories">
              Ready Stories ({stats.ready_stories})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="articles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Articles - {currentTopic?.name}</CardTitle>
                <CardDescription>
                  Articles waiting for approval to enter the generation pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : articles.length > 0 ? (
                  <div className="space-y-3">
                     {articles.map((article) => (
                       <div key={article.id} className="border rounded-lg">
                         <div className="p-4">
                           <div className="flex items-start justify-between mb-3">
                             <div className="flex-1">
                               <h3 className="font-medium mb-2">{article.title}</h3>
                               <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                 <Badge variant="outline">{article.word_count || 0} words</Badge>
                                 <Badge variant="outline">Quality: {article.content_quality_score || 0}%</Badge>
                                 <Badge variant="outline">Relevance: {article.regional_relevance_score || 0}%</Badge>
                                 <span>{new Date(article.created_at).toLocaleDateString()}</span>
                               </div>
                               {article.summary && (
                                 <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{article.summary}</p>
                               )}
                             </div>
                             <div className="flex items-center gap-2">
                               <Button
                                 onClick={() => setPreviewArticle(article)}
                                 size="sm"
                                 variant="outline"
                               >
                                 <Eye className="w-4 h-4" />
                               </Button>
                               <Button
                                 onClick={() => handleExtractContent(article)}
                                 size="sm"
                                 variant="outline"
                                 disabled={processingArticle === article.id}
                               >
                                 <Sparkles className="w-4 h-4" />
                               </Button>
                             </div>
                           </div>
                           
                           <div className="flex items-center gap-2 pt-2 border-t">
                             <div className="flex-1 grid grid-cols-3 gap-2">
                               <Button 
                                 onClick={() => approveArticle(article.id, 'short')}
                                 size="sm"
                                 variant="outline"
                                 disabled={processingArticle === article.id}
                               >
                                 <PlayCircle className="w-4 h-4 mr-1" />
                                 Short
                               </Button>
                               <Button 
                                 onClick={() => approveArticle(article.id, 'tabloid')}
                                 size="sm"
                                 disabled={processingArticle === article.id}
                               >
                                 <PlayCircle className="w-4 h-4 mr-1" />
                                 Tabloid
                               </Button>
                               <Button 
                                 onClick={() => approveArticle(article.id, 'indepth')}
                                 size="sm"
                                 variant="outline"
                                 disabled={processingArticle === article.id}
                               >
                                 <PlayCircle className="w-4 h-4 mr-1" />
                                 In-Depth
                               </Button>
                             </div>
                           </div>
                         </div>
                       </div>
                     ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No pending articles</h3>
                    <p className="text-muted-foreground">
                      All articles for this topic have been processed
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="queue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Processing Queue - {currentTopic?.name}</CardTitle>
                <CardDescription>
                  Articles currently being processed into stories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : queueItems.length > 0 ? (
                  <div className="space-y-3">
                    {queueItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-medium mb-1">{item.article.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Badge variant={
                              item.status === 'processing' ? 'default' : 
                              item.status === 'failed' ? 'destructive' : 'secondary'
                            }>
                              {item.status}
                            </Badge>
                            <span>Attempt {item.attempts}/{item.max_attempts}</span>
                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                          </div>
                          {item.error_message && (
                            <p className="text-sm text-red-600 mt-2">{item.error_message}</p>
                          )}
                        </div>
                        {item.status === 'failed' && (
                          <Button 
                            onClick={() => reprocessQueueItem(item.id)}
                            size="sm" 
                            variant="outline"
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No items in queue</h3>
                    <p className="text-muted-foreground">
                      Process queue is empty
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stories" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ready Stories - {currentTopic?.name}</CardTitle>
                <CardDescription>
                  Generated stories ready for publication
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : stories.length > 0 ? (
                  <div className="space-y-3">
                     {stories.map((story) => (
                       <div key={story.id} className="border rounded-lg">
                         <div className="p-4">
                           <div className="flex items-start justify-between mb-3">
                             <div className="flex-1">
                               <h3 className="font-medium mb-2">{story.title}</h3>
                               <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                 <Badge variant={story.status === 'ready' ? 'default' : 'secondary'}>{story.status}</Badge>
                                 <Badge variant={story.is_published ? 'default' : 'outline'}>
                                   {story.is_published ? 'Published' : 'Draft'}
                                 </Badge>
                                 <span>{story.slides.length} slides</span>
                                 <span>{new Date(story.created_at).toLocaleDateString()}</span>
                               </div>
                             </div>
                             <div className="flex items-center gap-2">
                               <Button
                                 onClick={() => setEditingStory(story)}
                                 size="sm"
                                 variant="outline"
                               >
                                 <Edit className="w-4 h-4" />
                               </Button>
                               <Button
                                 onClick={() => toggleStoryPublication(story.id, story.is_published)}
                                 size="sm"
                                 variant={story.is_published ? 'outline' : 'default'}
                               >
                                 {story.is_published ? 'Unpublish' : 'Publish'}
                               </Button>
                               <Button size="sm" variant="outline" asChild>
                                 <a href={story.article.source_url} target="_blank" rel="noopener noreferrer">
                                   <ExternalLink className="w-4 h-4" />
                                 </a>
                               </Button>
                             </div>
                           </div>
                         </div>
                       </div>
                     ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No stories ready</h3>
                    <p className="text-muted-foreground">
                      No completed stories for this topic yet
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Article Preview Dialog */}
      <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewArticle?.title}</DialogTitle>
            <DialogDescription>
              Article preview • {previewArticle?.word_count || 0} words
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Quality: {previewArticle?.content_quality_score || 0}%</Badge>
              <Badge variant="outline">Relevance: {previewArticle?.regional_relevance_score || 0}%</Badge>
            </div>
            {previewArticle?.summary && (
              <div>
                <h4 className="font-medium mb-2">Summary</h4>
                <p className="text-sm">{previewArticle.summary}</p>
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Content</h4>
              <div className="text-sm prose max-w-none">
                {previewArticle?.body ? (
                  <div className="whitespace-pre-wrap">{previewArticle.body.substring(0, 2000)}{previewArticle.body.length > 2000 ? '...' : ''}</div>
                ) : (
                  <p className="text-muted-foreground italic">No content available. Try extracting content first.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" asChild>
                <a href={previewArticle?.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Source
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Story Editing Dialog */}
      <Dialog open={!!editingStory} onOpenChange={() => setEditingStory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Story: {editingStory?.title}</DialogTitle>
            <DialogDescription>
              Review and edit story slides • {editingStory?.slides.length || 0} slides
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingStory?.slides.map((slide, index) => (
              <div key={slide.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Slide {slide.slide_number}</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingSlideId(slide.id);
                      setEditingSlideContent(slide.content);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
                {editingSlideId === slide.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingSlideContent}
                      onChange={(e) => setEditingSlideContent(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveSlideEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingSlideId('')}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{slide.content}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};