import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";
import { ManualContentStaging } from "@/components/ManualContentStaging";
import TopicCTAManager from "@/components/topic/TopicCTAManager";
import { KeywordManager } from "@/components/KeywordManager";
import { TopicScheduleMonitor } from "@/components/TopicScheduleMonitor";
import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { TopicSettings } from "@/components/TopicSettings";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { TopicCompetingRegions } from "@/components/TopicCompetingRegions";
import { SentimentManager } from "@/components/SentimentManager";
import { SentimentInsights } from "@/components/SentimentInsights";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Settings, FileText, Users, ExternalLink, MapPin, Hash, Clock, CheckCircle, ChevronDown, Loader2, RefreshCw, Activity, Database, Globe, Play, ToggleLeft, ToggleRight, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateTopicGradient, generateAccentColor } from "@/lib/colorUtils";

interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  arrivals_count: number;
  simplified_stories_24h: number;
  sentiment_cards: number;
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
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  community_intelligence_enabled?: boolean;
  auto_simplify_enabled?: boolean;
  automation_quality_threshold?: number;
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
    ready_stories: 0,
    arrivals_count: 0,
    simplified_stories_24h: 0,
    sentiment_cards: 0
  });
  const [loading, setLoading] = useState(true);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [activeTab, setActiveTab] = useState("content-flow");
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
        .select('*, auto_simplify_enabled, automation_quality_threshold')
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
        competing_regions: topicData.competing_regions || [],
        default_writing_style: (topicData.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven') || 'journalistic'
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
        .eq('status', 'published') : { count: 0 };

      // Get arrivals count (articles + topic_articles)
      const arrivalsRes = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new');

      // Get simplified stories in last 24h
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const simplifiedRes = articleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('article_id', articleIds)
        .gte('created_at', yesterday.toISOString()) : { count: 0 };

      // Get sentiment cards count
      const sentimentRes = await supabase
        .from('sentiment_cards')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesRes.count || 0,
        pending_articles: pendingArticlesRes.count || 0,
        processing_queue: queueRes.count || 0,
        ready_stories: readyStoriesRes.count || 0,
        arrivals_count: arrivalsRes.count || 0,
        simplified_stories_24h: simplifiedRes.count || 0,
        sentiment_cards: sentimentRes.count || 0
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

  const handleGatherAll = async () => {
    if (!topic) return;
    
    setGatheringAll(true);
    try {
      // Call the universal scraper for this topic
      const response = await supabase.functions.invoke('universal-topic-scraper', {
        body: { topicId: topic.id }
      });

      if (response.error) throw response.error;
      
      toast({
        title: "Gathering Started",
        description: "Content gathering initiated for all sources",
      });
      
      // Refresh stats after a short delay
      setTimeout(loadTopicAndStats, 2000);
    } catch (error) {
      console.error('Error gathering content:', error);
      toast({
        title: "Error",
        description: "Failed to start content gathering",
        variant: "destructive"
      });
    } finally {
      setGatheringAll(false);
    }
  };

  const handleAutoSimplifyToggle = async () => {
    if (!topic) return;
    
    try {
      const newValue = !topic.auto_simplify_enabled;
      
      const { error } = await supabase
        .from('topics')
        .update({ auto_simplify_enabled: newValue })
        .eq('id', topic.id);

      if (error) throw error;

      setTopic(prev => prev ? { ...prev, auto_simplify_enabled: newValue } : prev);
      
      toast({
        title: "Settings Updated",
        description: `Auto-simplify ${newValue ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Error toggling auto-simplify:', error);
      toast({
        title: "Error",
        description: "Failed to update auto-simplify setting",
        variant: "destructive"
      });
    }
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

  const topicGradient = topic ? generateTopicGradient(topic.id) : '';
  const accentColor = topic ? generateAccentColor(topic.id) : '';

  return (
    <div className={`min-h-screen ${topicGradient}`}>
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
          <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
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
              className="bg-card/60 backdrop-blur-sm border-border/50 hover:bg-card/80"
            >
              <BarChart3 className="h-4 w-4" />
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${dashboardExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            {/* Essential Metrics - New Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="text-2xl font-bold text-blue-500">{stats.arrivals_count}</div>
                      <p className="text-sm text-muted-foreground">Articles in Arrivals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold text-green-500">{stats.simplified_stories_24h}</div>
                      <p className="text-sm text-muted-foreground">Stories Simplified (24h)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Essential Metrics - Available Stories */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-chart-2" />
                    <div>
                      <div className="text-2xl font-bold text-chart-2">{stats.pending_articles}</div>
                      <p className="text-sm text-muted-foreground">Available Articles</p>
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
                    <CheckCircle className="h-5 w-5 text-chart-1" />
                    <div>
                      <div className="text-2xl font-bold text-chart-1">{stats.ready_stories}</div>
                      <p className="text-sm text-muted-foreground">Available Stories</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="text-2xl font-bold text-purple-500">{stats.sentiment_cards}</div>
                      <p className="text-sm text-muted-foreground">Sentiment Cards</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Additional Metrics */}
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
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Primary Action Bar */}
        <Card className={`${accentColor} bg-card/60 backdrop-blur-sm mb-6`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Button 
                  onClick={handleGatherAll}
                  disabled={gatheringAll}
                  className="flex items-center gap-2"
                >
                  {gatheringAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {gatheringAll ? 'Gathering...' : 'Gather All'}
                </Button>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Auto-simplify:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoSimplifyToggle}
                    className="p-1 h-auto"
                  >
                    {topic?.auto_simplify_enabled ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              
              <Button variant="outline" asChild size="sm">
                <Link to={`/feed/topic/${topic.slug}`} target="_blank">
                  <Globe className="w-4 h-4 mr-2" />
                  Preview Feed
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content-flow" className="space-y-6" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full grid-cols-3 mobile-tabs bg-card/60 backdrop-blur-sm ${accentColor}`}>
            <TabsTrigger value="content-flow">Content Flow</TabsTrigger>
            <TabsTrigger value="automation">Automation & Sources</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="content-flow" className="space-y-6">
            {/* Sentiment Insights - Show when data exists */}
            {stats.sentiment_cards > 0 && (
              <SentimentInsights 
                topicId={topic.id} 
                isExpanded={false} 
                onNavigateToSentiment={() => {
                  setActiveTab("advanced");
                  // Scroll to sentiment section after tab change
                  setTimeout(() => {
                    const sentimentSection = document.getElementById('sentiment-section');
                    if (sentimentSection) {
                      sentimentSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 100);
                }}
              />
            )}
            
            {/* Manual Content Staging Area - Critical: Above main pipeline */}
            <ManualContentStaging 
              topicId={topic.id} 
              onContentProcessed={loadTopicAndStats}
            />
            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
              <CardContent className="p-6">
                <UnifiedContentPipeline selectedTopicId={topic.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
              <CardContent className="p-6">
                <TopicScheduleMonitor 
                  topicId={topic.id}
                  topicName={topic.name}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-8">
            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
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
                  currentWritingStyle={topic.default_writing_style}
                  currentCommunityEnabled={topic.community_intelligence_enabled}
                  currentAutoSimplifyEnabled={topic.auto_simplify_enabled}
                  currentAutomationQualityThreshold={topic.automation_quality_threshold}
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

            <Card id="sentiment-section" className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Sentiment Analysis
                </CardTitle>
                <CardDescription>
                  Monitor community sentiment and trends from your published content
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <SentimentManager topicId={topic.id} />
              </CardContent>
            </Card>

            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
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
        </Tabs>
      </div>
    </div>
  );
};

export default TopicDashboard;