import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayCircle, Clock, CheckCircle, AlertCircle, BarChart3 } from "lucide-react";
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
        .eq('status', 'ready')
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

  const approveArticle = async (articleId: string) => {
    try {
      const { error } = await supabase.rpc('approve_article_for_generation', {
        article_uuid: articleId
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Article approved and added to generation queue"
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error approving article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
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
                      <div key={article.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-medium mb-1">{article.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{article.word_count || 0} words</span>
                            <span>Quality: {article.content_quality_score || 0}%</span>
                            <span>Relevance: {article.regional_relevance_score || 0}%</span>
                            <span>{new Date(article.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Button 
                          onClick={() => approveArticle(article.id)}
                          size="sm"
                        >
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
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
                      <div key={story.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-medium mb-1">{story.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Badge variant="default">{story.status}</Badge>
                            <span>{story.slides.length} slides</span>
                            <span>{new Date(story.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <a href={story.article.source_url} target="_blank" rel="noopener noreferrer">
                            View Source
                          </a>
                        </Button>
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

      {!selectedTopicId && topics.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No topics available</h3>
            <p className="text-muted-foreground">
              Create a topic first to start processing content
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};