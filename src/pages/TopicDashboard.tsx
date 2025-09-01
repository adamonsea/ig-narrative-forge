import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { TopicAwareContentPipeline } from "@/components/TopicAwareContentPipeline";
import TopicCTAManager from "@/components/topic/TopicCTAManager";
import { KeywordManager } from "@/components/KeywordManager";
import { TopicScheduleMonitor } from "@/components/TopicScheduleMonitor";
import { ScrapingAutomationManager } from "@/components/ScrapingAutomationManager";
import { TopicPipelineStats } from "@/components/TopicPipelineStats";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Settings, FileText, Globe, Users, ExternalLink, MapPin, Hash, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
}

interface Topic {
  id: string;
  name: string;
  description: string;
  slug: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  region?: string;
  is_public: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const TopicDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAdmin } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [stats, setStats] = useState<TopicDashboardStats>({
    articles: 0,
    stories: 0,
    sources: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (slug && user) {
      loadTopicAndStats();
    }
  }, [slug, user]);

  const loadTopicAndStats = async () => {
    try {
      // Load topic
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('slug', slug)
        .single();

      if (topicError) {
        if (topicError.code === 'PGRST116') {
          throw new Error('Topic not found');
        }
        throw topicError;
      }

      // Check if user has access to this topic
      const canAccess = topicData.created_by === user?.id || 
                       isAdmin || 
                       topicData.is_public;

      if (!canAccess) {
        throw new Error('Access denied');
      }

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicData.keywords || [],
        landmarks: topicData.landmarks || [],
        postcodes: topicData.postcodes || [],
        organizations: topicData.organizations || []
      });

      // Load stats
      const [articlesRes, storiesRes, sourcesRes] = await Promise.all([
        supabase
          .from('articles')
          .select('id', { count: 'exact' })
          .eq('topic_id', topicData.id),
        supabase
          .from('stories')
          .select('id', { count: 'exact' })
          .eq('articles.topic_id', topicData.id),
        supabase
          .from('content_sources')
          .select('id', { count: 'exact' })
          .eq('topic_id', topicData.id)
      ]);

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesRes.count || 0
      });

    } catch (error) {
      console.error('Error loading topic dashboard:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load topic dashboard",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate gradient based on topic ID for consistency with dashboard
  const getTopicGradient = (topicId: string) => {
    const gradients = [
      'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20',
      'from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20',
      'from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20',
      'from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20',
      'from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20',
      'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20',
      'from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20',
      'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20',
    ];
    
    // Use topic ID to consistently select the same gradient
    const hash = topicId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return gradients[Math.abs(hash) % gradients.length];
  };

  const getAccentGradient = (topicId: string) => {
    const accentGradients = [
      'from-blue-500/10 to-indigo-500/5 dark:from-blue-400/10 dark:to-indigo-400/5',
      'from-purple-500/10 to-pink-500/5 dark:from-purple-400/10 dark:to-pink-400/5',
      'from-green-500/10 to-emerald-500/5 dark:from-green-400/10 dark:to-emerald-400/5',
      'from-orange-500/10 to-red-500/5 dark:from-orange-400/10 dark:to-red-400/5',
      'from-teal-500/10 to-cyan-500/5 dark:from-teal-400/10 dark:to-cyan-400/5',
      'from-violet-500/10 to-purple-500/5 dark:from-violet-400/10 dark:to-purple-400/5',
      'from-rose-500/10 to-pink-500/5 dark:from-rose-400/10 dark:to-pink-400/5',
      'from-amber-500/10 to-yellow-500/5 dark:from-amber-400/10 dark:to-yellow-400/5',
    ];
    
    const hash = topicId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return accentGradients[Math.abs(hash) % accentGradients.length];
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">
              Please log in to access the topic dashboard.
            </p>
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Topic Not Found</h1>
            <p className="text-muted-foreground">
              The topic you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button asChild>
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const topicGradient = topic ? getTopicGradient(topic.id) : '';
  const accentGradient = topic ? getAccentGradient(topic.id) : '';

  return (
    <div className={`min-h-screen bg-gradient-to-br ${topicGradient}`}>
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{topic.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Topic Header */}
        <div className="mb-8">
          <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
            <CardContent className="p-6">
              <div className="mobile-card-header mb-4">
                <div className="flex items-center gap-3">
                  {topic.topic_type === 'regional' ? (
                    <MapPin className="w-8 h-8 text-blue-500" />
                  ) : (
                    <Hash className="w-8 h-8 text-green-500" />
                  )}
                  <div>
                    <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {topic.name}
                    </h1>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={topic.is_active ? "default" : "secondary"}>
                        {topic.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {topic.is_public ? (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Private
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mobile-header-actions">
                  <Button variant="outline" asChild className="w-full sm:w-auto">
                    <Link to={`/feed/topic/${topic.slug}`} target="_blank">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Feed
                    </Link>
                  </Button>
                </div>
              </div>

              {topic.description && (
                <p className="text-muted-foreground mb-4">
                  {topic.description}
                </p>
              )}

              {/* Keywords */}
              {topic.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topic.keywords.map((keyword, index) => (
                    <Badge key={index} variant="secondary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards - Combined Topic and Pipeline Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          {/* Topic Stats */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sources</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sources}</div>
              <p className="text-xs text-muted-foreground">Active sources</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Articles</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.articles}</div>
              <p className="text-xs text-muted-foreground">Total articles</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stories</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.stories}</div>
              <p className="text-xs text-muted-foreground">Generated stories</p>
            </CardContent>
          </Card>

          {/* Pipeline Stats from TopicAwareContentPipeline */}
          <TopicPipelineStats topicId={topic.id} />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className={`grid w-full mobile-tabs bg-gradient-to-r ${accentGradient} border-border/50`}>
            <TabsTrigger 
              value="content" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/90 data-[state=active]:to-primary data-[state=active]:text-primary-foreground font-medium"
            >
              Content Pipeline
            </TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="management">Management</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-6">
            <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
              <CardContent className="p-6">
                <TopicAwareContentPipeline selectedTopicId={topic.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="space-y-6">
            <TopicAwareSourceManager 
              selectedTopicId={topic.id} 
              onSourcesChange={() => loadTopicAndStats()} 
            />
          </TabsContent>

          <TabsContent value="management" className="space-y-6">
            <div className="space-y-6">
              <TopicCTAManager 
                topicId={topic.id} 
                topicName={topic.name}
                onClose={() => {}} 
              />
              
              <KeywordManager 
                topic={topic} 
                onTopicUpdate={(updatedTopic: Topic) => {
                  setTopic((prevTopic) => ({
                    ...prevTopic!,
                    ...updatedTopic
                  }));
                  loadTopicAndStats(); // Refresh stats after keyword update
                }} 
              />
              
              <Card>
                <CardHeader>
                  <CardTitle>Topic Configuration</CardTitle>
                  <CardDescription>
                    Basic topic information and metadata
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Topic Type</label>
                        <p className="text-sm text-muted-foreground capitalize">
                          {topic.topic_type}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Region</label>
                        <p className="text-sm text-muted-foreground">
                          {topic.region || 'Global'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Created</label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(topic.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Slug</label>
                      <p className="text-sm text-muted-foreground font-mono">
                        {topic.slug}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default TopicDashboard;