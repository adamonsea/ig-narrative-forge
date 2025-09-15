import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { ImprovedSourceSuggestionTool } from "@/components/ImprovedSourceSuggestionTool";
import { KeywordSuggestionTool } from "@/components/KeywordSuggestionTool";
import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";
import TopicCTAManager from "@/components/topic/TopicCTAManager";
import { KeywordManager } from "@/components/KeywordManager";
import { TopicScheduleMonitor } from "@/components/TopicScheduleMonitor";

import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { TopicSettings } from "@/components/TopicSettings";
import { SentimentManager } from "@/components/SentimentManager";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { TopicCompetingRegions } from "@/components/TopicCompetingRegions";
import { UniversalTopicScraper } from "@/components/UniversalTopicScraper";
import { JunctionTableValidator } from "@/components/JunctionTableValidator";
import { UniversalScrapingValidator } from "@/components/UniversalScrapingValidator";
import { ArticleReExtractor } from "@/components/ArticleReExtractor";
import { ArchitectureMigrationValidator } from "@/components/ArchitectureMigrationValidator";
import { EventsManager } from "@/components/EventsManager";
import { EnhancedEventsManager } from "@/components/EnhancedEventsManager";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Settings, FileText, Users, ExternalLink, MapPin, Hash, Clock, CheckCircle, ChevronDown, Loader2, RefreshCw, Activity, Database, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
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
  negative_keywords?: string[];
  competing_regions?: string[];
  region?: string;
  is_public: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
  audience_expertise?: 'beginner' | 'intermediate' | 'expert';
  default_tone?: 'formal' | 'conversational' | 'engaging';
}

const TopicDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAdmin } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [negativeKeywords, setNegativeKeywords] = useState<string[]>([]);
  const [competingRegions, setCompetingRegions] = useState<string[]>([]);
  const [stats, setStats] = useState<TopicDashboardStats>({
    articles: 0,
    stories: 0,
    sources: 0,
    pending_articles: 0,
    processing_queue: 0,
    ready_stories: 0
  });
  const [loading, setLoading] = useState(true);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
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

      // Check if user has ADMIN access to this topic (not just viewing access)
      const hasAdminAccess = topicData.created_by === user?.id || isAdmin;

      if (!hasAdminAccess) {
        // Redirect non-owners to the public feed view instead of throwing error
        window.location.href = `/feed/topic/${slug}`;
        return;
      }

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicData.keywords || [],
        landmarks: topicData.landmarks || [],
        postcodes: topicData.postcodes || [],
        organizations: topicData.organizations || [],
        negative_keywords: topicData.negative_keywords || [],
        competing_regions: topicData.competing_regions || []
      });

      setNegativeKeywords(topicData.negative_keywords || []);
      setCompetingRegions(topicData.competing_regions || []);

      // Load stats with sequential queries to avoid nested async issues
      // First get article IDs for this topic
      const { data: topicArticles } = await supabase
        .from('articles')
        .select('id')
        .eq('topic_id', topicData.id);

      const articleIds = topicArticles?.map(a => a.id) || [];

      // Load stats sequentially
      const articlesRes = await supabase
        .from('articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      const storiesRes = articleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('article_id', articleIds) : { count: 0 };

      const sourcesRes = await supabase
        .from('content_sources')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      const pendingArticlesRes = await supabase
        .from('articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new');

      const queueRes = articleIds.length > 0 ? await supabase
        .from('content_generation_queue')
        .select('id', { count: 'exact' })
        .in('article_id', articleIds)
        .neq('status', 'completed') : { count: 0 };

      const readyStoriesRes = articleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('article_id', articleIds)
        .eq('status', 'ready') : { count: 0 };

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesRes.count || 0,
        pending_articles: pendingArticlesRes.count || 0,
        processing_queue: queueRes.count || 0,
        ready_stories: readyStoriesRes.count || 0
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
            <CardContent className="p-6 relative">
              <Button variant="outline" asChild className="absolute top-4 right-4 z-10">
                <Link to={`/feed/topic/${topic.slug}`} target="_blank">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Feed
                </Link>
              </Button>
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
                        {topic.is_active ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {topic.description && (
                <p className="text-muted-foreground mb-4">
                  {topic.description}
                </p>
              )}

              {/* Keywords */}
              {topic.keywords.length > 0 && (
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-wrap gap-2 cursor-help">
                          <Badge variant="outline" className="text-xs">
                            <Hash className="w-3 h-3 mr-1" />
                            {topic.keywords.length} Keywords
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="space-y-1">
                          <p className="font-medium">Keywords:</p>
                          <div className="flex flex-wrap gap-1">
                            {topic.keywords.map((keyword, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-help text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Created
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Created: {new Date(topic.created_at).toLocaleDateString()}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Collapsible Dashboard Overview */}
        <Collapsible open={dashboardExpanded} onOpenChange={setDashboardExpanded} className="mb-8">
          <CollapsibleTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className={`bg-gradient-to-br ${accentGradient} border-border/30 hover:bg-accent`}
            >
              <BarChart3 className="h-4 w-4" />
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${dashboardExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            {/* Pipeline Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
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
              
              <Card>
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
              
              <Card>
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
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Sources</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.sources}</div>
                  <p className="text-xs text-muted-foreground">Active content sources</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Articles</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.articles}</div>
                  <p className="text-xs text-muted-foreground">Imported articles</p>
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
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className={`grid w-full grid-cols-3 mobile-tabs bg-gradient-to-r ${accentGradient} border-border/50`}>
            <TabsTrigger value="content">Content Pipeline</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="management">Management</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-6">
            <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
              <CardContent className="p-6">
                <UnifiedContentPipeline selectedTopicId={topic.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="space-y-6">
            <Tabs defaultValue="management" className="space-y-6">
              <TabsList className={`w-full bg-card/50 border border-border/30`}>
                <TabsTrigger value="management" className="flex-1">Source Management</TabsTrigger>
                <TabsTrigger value="suggestions" className="flex-1">Suggestions</TabsTrigger>
              </TabsList>

              <TabsContent value="suggestions" className="space-y-6">
                <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <ImprovedSourceSuggestionTool
                        topicName={topic.name}
                        description={topic.description || ''}
                        keywords={topic.keywords.join(', ')}
                        topicType={topic.topic_type}
                        region={topic.region}
                        topicId={topic.id}
                      />
                      <KeywordSuggestionTool
                        topicName={topic.name}
                        description={topic.description || ''}
                        keywords={topic.keywords}
                        topicType={topic.topic_type}
                        region={topic.region}
                        onKeywordAdd={async (keyword) => {
                          // Add keyword to database immediately
                          try {
                            const updatedKeywords = [...topic.keywords, keyword];
                            const { error } = await supabase
                              .from('topics')
                              .update({ 
                                keywords: updatedKeywords,
                                updated_at: new Date().toISOString()
                              })
                              .eq('id', topic.id);

                            if (error) throw error;

                            // Update local state immediately
                            setTopic(prev => ({
                              ...prev!,
                              keywords: updatedKeywords
                            }));
                            
                            toast({
                              title: "Keyword Added",
                              description: `"${keyword}" has been added to ${topic.name}`,
                            });
                          } catch (error) {
                            console.error('Error adding keyword:', error);
                            toast({
                              title: "Error",
                              description: "Failed to add keyword",
                              variant: "destructive"
                            });
                          }
                        }}
                        existingKeywords={topic.keywords}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="management" className="space-y-6">
                <TopicAwareSourceManager 
                  selectedTopicId={topic.id} 
                  onSourcesChange={() => loadTopicAndStats()} 
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="management" className="space-y-8">
            <Tabs defaultValue="settings" className="space-y-6">
              <TabsList className={`w-full bg-card/50 border border-border/30`}>
                <TabsTrigger value="settings" className="flex-1">Topic Settings</TabsTrigger>
                <TabsTrigger value="subscribers" className="flex-1">Subscribers</TabsTrigger>
                <TabsTrigger value="automation" className="flex-1">Automation</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-8">
                <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Topic Configuration
                    </CardTitle>
                    <CardDescription>
                      Manage your topic's call-to-action and keyword settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <TopicSettings
                      topicId={topic.id}
                      currentExpertise={topic.audience_expertise}
                      currentTone={topic.default_tone}
                      onUpdate={() => loadTopicAndStats()}
                    />
                    
                    <div className="border-t pt-8">
                      <TopicCTAManager 
                        topicId={topic.id} 
                        topicName={topic.name}
                        onClose={() => {}} 
                      />
                    </div>
                    
                    <div className="border-t pt-8">
                      <KeywordManager 
                        topic={topic} 
                        onTopicUpdate={(updatedTopic: Topic) => {
                          setTopic((prevTopic) => ({
                            ...prevTopic!,
                            ...updatedTopic
                          }));
                          loadTopicAndStats();
                        }} 
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Advanced Filtering for Regional Topics */}
                {topic.topic_type === 'regional' && (
                  <div className="grid gap-6 md:grid-cols-2">
                    <TopicNegativeKeywords
                      topicId={topic.id}
                      negativeKeywords={negativeKeywords}
                      onUpdate={setNegativeKeywords}
                    />
                    <TopicCompetingRegions
                      topicId={topic.id}
                      competingRegions={competingRegions}
                      onUpdate={setCompetingRegions}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="subscribers" className="space-y-6">
                <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Topic Subscribers
                    </CardTitle>
                    <CardDescription>
                      View and manage users who have subscribed to notifications for this topic
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <NewsletterSignupsManager topicId={topic.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="automation" className="space-y-6">
                <Card className={`border-border/30 bg-gradient-to-br ${accentGradient} backdrop-blur-sm`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Automation & Scheduling
                    </CardTitle>
                    <CardDescription>
                      Configure automated content processing and scheduling settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <TopicScheduleMonitor 
                      topicId={topic.id}
                      topicName={topic.name}
                    />
                    
                    <div className="border-t pt-8">
                      <EnhancedEventsManager 
                        topicId={topic.id} 
                        topicName={topic.name}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>


        </Tabs>
      </div>
    </div>
  );
};

export default TopicDashboard;