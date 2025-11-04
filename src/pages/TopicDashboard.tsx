import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";
import { ManualContentStaging } from "@/components/ManualContentStaging";
import { GatheringProgressIndicator } from "@/components/GatheringProgressIndicator";
import { KeywordManager } from "@/components/KeywordManager";
import { TopicScheduleMonitor } from "@/components/TopicScheduleMonitor";
import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { TopicSettings } from "@/components/TopicSettings";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { TopicBrandingSettings } from "@/components/TopicBrandingSettings";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { TopicCompetingRegions } from "@/components/TopicCompetingRegions";
import { SentimentManager } from "@/components/SentimentManager";
import { SentimentInsights } from "@/components/SentimentInsights";
import { ParliamentaryBackfillTrigger } from "@/components/ParliamentaryBackfillTrigger";
import { TopicDonationSettings } from "@/components/TopicDonationSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParliamentaryAutomation } from "@/hooks/useParliamentaryAutomation";
import { BarChart3, Settings, FileText, Users, ExternalLink, MapPin, Hash, Clock, CheckCircle, ChevronDown, Loader2, RefreshCw, Activity, Database, Globe, Play, ToggleLeft, ToggleRight, MessageCircle, AlertCircle, Eye, EyeOff, Palette, Target, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateTopicGradient, generateAccentColor } from "@/lib/colorUtils";

interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  sentiment_cards: number;
  notifications_enabled?: number;
  pwa_installs?: number;
  donation_button_clicks?: number;
  donation_modal_opens?: number;
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
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  community_intelligence_enabled?: boolean;
  community_pulse_frequency?: number;
  community_config?: {
    subreddits?: string[];
    last_processed?: string;
    processing_frequency_hours?: number;
  };
  auto_simplify_enabled?: boolean;
  automation_quality_threshold?: number;
  parliamentary_tracking_enabled?: boolean;
  branding_config?: any; // Use any to handle Json type from Supabase
  donation_enabled?: boolean;
  donation_config?: any;
}

const SCRAPING_WINDOW_OPTIONS = new Set([7, 30, 60, 100]);

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
    simplified_stories_24h: 0,
    sentiment_cards: 0
  });
  const [loading, setLoading] = useState(true);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [activeTab, setActiveTab] = useState("content-flow");
  const [subscribersCollapsed, setSubscribersCollapsed] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingPublishState, setPendingPublishState] = useState<boolean>(false);
  const { toast } = useToast();

  // Set up parliamentary automation when enabled
  useParliamentaryAutomation({
    topicId: topic?.id || '',
    enabled: topic?.topic_type === 'regional' && topic?.parliamentary_tracking_enabled === true,
    region: topic?.region
  });

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
        .select('*, auto_simplify_enabled, automation_quality_threshold, branding_config, donation_enabled, donation_config, community_config, community_pulse_frequency')
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
        window.location.href = `/feed/${slug}`;
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
        default_writing_style: (topicData.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven') || 'journalistic',
        community_config: topicData.community_config as any || { subreddits: [], processing_frequency_hours: 24 }
      });

      setNegativeKeywords(topicData.negative_keywords || []);
      setCompetingRegions(topicData.competing_regions || []);

      // Load stats using multi-tenant architecture (topic_articles)
      const articlesRes = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      // Get topic article IDs for related queries
      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicData.id);

      const topicArticleIds = topicArticles?.map(a => a.id) || [];

      const storiesRes = topicArticleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('topic_article_id', topicArticleIds) : { count: 0 };

      // Use topic_sources junction table for accurate source count
      const { count: sourcesCount } = await supabase
        .from('topic_sources')
        .select('source_id', { count: 'exact' })
        .eq('topic_id', topicData.id)
        .eq('is_active', true);

      const pendingArticlesRes = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new');

      const queueRes = topicArticleIds.length > 0 ? await supabase
        .from('content_generation_queue')
        .select('id', { count: 'exact' })
        .in('topic_article_id', topicArticleIds)
        .neq('status', 'completed') : { count: 0 };

      const readyStoriesRes = topicArticleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('topic_article_id', topicArticleIds)
        .in('status', ['ready', 'published']) : { count: 0 };

      // Get arrivals count (new topic_articles)
      const arrivalsRes = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new');

      // Get simplified stories in last 24h
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const simplifiedRes = topicArticleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('topic_article_id', topicArticleIds)
        .gte('created_at', yesterday.toISOString()) : { count: 0 };

      // Get sentiment cards count
      const sentimentRes = await supabase
        .from('sentiment_cards')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      // Get engagement stats
      const { data: engagementStats } = await supabase.rpc(
        'get_topic_engagement_stats',
        { p_topic_id: topicData.id }
      );

      // Get donation interaction stats
      const { count: donationButtonClicks } = await supabase
        .from('story_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'donation_button_clicked');

      const { count: donationModalOpens } = await supabase
        .from('story_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'donation_modal_opened');

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesCount || 0,
        pending_articles: pendingArticlesRes.count || 0,
        processing_queue: queueRes.count || 0,
        ready_stories: readyStoriesRes.count || 0,
        simplified_stories_24h: simplifiedRes.count || 0,
        sentiment_cards: sentimentRes.count || 0,
        notifications_enabled: Number(engagementStats?.[0]?.notifications_enabled || 0),
        pwa_installs: Number(engagementStats?.[0]?.pwa_installs || 0),
        donation_button_clicks: donationButtonClicks || 0,
        donation_modal_opens: donationModalOpens || 0,
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

  const [jobRunId, setJobRunId] = useState<string | null>(null);
  const [showGatheringProgress, setShowGatheringProgress] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  const [forceRescrape, setForceRescrape] = useState(true);

  useEffect(() => {
    if (!topic?.id || typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(`topic-scraping-settings:${topic.id}`);
      if (!stored) return;

      const parsed = JSON.parse(stored) as { maxAgeDays?: number; forceRescrape?: boolean };

      if (typeof parsed.maxAgeDays === "number" && SCRAPING_WINDOW_OPTIONS.has(parsed.maxAgeDays)) {
        setMaxAgeDays(parsed.maxAgeDays);
      }

      if (typeof parsed.forceRescrape === "boolean") {
        setForceRescrape(parsed.forceRescrape);
      }
    } catch (error) {
      console.warn("Failed to load saved scraping settings", error);
    }
  }, [topic?.id]);

  useEffect(() => {
    if (!topic?.id || typeof window === "undefined") return;

    const payload = JSON.stringify({ maxAgeDays, forceRescrape });
    window.localStorage.setItem(`topic-scraping-settings:${topic.id}`, payload);
  }, [topic?.id, maxAgeDays, forceRescrape]);

  const handleStartScraping = async () => {
    if (!topic) return;
    
    setGatheringAll(true);
    setShowGatheringProgress(true);
    try {
      // Call universal-topic-automation with configured options
      const response = await supabase.functions.invoke('universal-topic-automation', {
        body: { 
          topicIds: [topic.id],
          force: forceRescrape,
          dryRun: false,
          maxAgeDays: maxAgeDays
        }
      });

      if (response.error) throw response.error;
      
      const jobId = response.data?.jobRunId;
      if (jobId) {
        setJobRunId(jobId);
      }
      
      toast({
        title: "Scraping Started",
        description: `Gathering content from last ${maxAgeDays} days across all sources`,
      });
      
      // Refresh stats periodically
      const refreshInterval = setInterval(() => {
        loadTopicAndStats();
      }, 5000);
      
      setTimeout(() => {
        clearInterval(refreshInterval);
        setGatheringAll(false);
      }, 60000); // Stop polling after 1 minute
      
    } catch (error) {
      console.error('Error starting scrape:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start scraping",
        variant: "destructive"
      });
      setGatheringAll(false);
      setShowGatheringProgress(false);
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

      // Refresh topic data to ensure all dependent widgets receive the latest value
      await loadTopicAndStats();

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

  const handlePublishToggle = (newState: boolean) => {
    if (!topic) return;
    
    if (!newState) {
      // Unpublishing - show confirmation dialog
      setPendingPublishState(newState);
      setShowConfirmDialog(true);
    } else {
      // Publishing - do it directly
      confirmPublishToggle(newState);
    }
  };

  const confirmPublishToggle = async (newState: boolean) => {
    if (!topic) return;
    
    try {
      const { error } = await supabase
        .from('topics')
        .update({ 
          is_public: newState,
          is_active: newState // Keep both in sync
        })
        .eq('id', topic.id);

      if (error) throw error;

      setTopic(prev => prev ? { 
        ...prev, 
        is_public: newState,
        is_active: newState 
      } : null);
      
      toast({
        title: "Success",
        description: `Feed ${newState ? 'published' : 'unpublished'}`,
      });
    } catch (error) {
      console.error('Error updating publish status:', error);
      toast({
        title: "Error",
        description: "Failed to update publish status",
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

  // Progressive disclosure logic
  const hasEnoughArticles = stats.articles > 10;
  const needsAttention = {
    contentFlow: stats.pending_articles > 0 || stats.processing_queue > 0,
    automation: stats.sources === 0,
    advanced: !topic.audience_expertise || !topic.default_tone || topic.keywords.length === 0
  };

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
                <Link to={`/feed/${topic.slug}`} target="_blank">
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
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant={topic.is_public ? "default" : "secondary"}>
                          {topic.is_public ? (
                            <>
                              <Eye className="w-3 h-3 mr-1" />
                              Published
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3 mr-1" />
                              Draft
                            </>
                          )}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <label htmlFor="publish-toggle" className="text-sm font-medium cursor-pointer">
                          {topic.is_public ? 'Live' : 'Draft'}
                        </label>
                        <Switch
                          id="publish-toggle"
                          checked={topic.is_public}
                          onCheckedChange={handlePublishToggle}
                        />
                      </div>
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

        {/* Collapsible Dashboard Overview - Simplified to Key Highlights Only */}
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
            {/* Key Highlights Only */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold text-green-500">{stats.simplified_stories_24h}</div>
                      <p className="text-sm text-muted-foreground">Stories (24h)</p>
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
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-2xl font-bold">{stats.sources}</div>
                      <p className="text-sm text-muted-foreground">Active Sources</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-2xl font-bold">{stats.pending_articles}</div>
                      <p className="text-sm text-muted-foreground">Available Articles</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Primary Action Bar - Mobile Responsive */}
        <Card className={`${accentColor} bg-card/60 backdrop-blur-sm mb-6`}>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <Button 
                  onClick={handleStartScraping}
                  disabled={gatheringAll}
                  className="flex items-center gap-2 w-full sm:w-auto"
                  size="lg"
                >
                  {gatheringAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {gatheringAll ? 'Scraping...' : 'Start Scraping'}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full sm:w-auto"
                >
                  {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
                </Button>
                
                <div className="flex items-center gap-2 justify-center sm:justify-start ml-auto">
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

              {showAdvancedOptions && (
                <div className="flex flex-col sm:flex-row gap-4 pt-3 border-t border-border">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Content Age Window</label>
                    <select 
                      value={maxAgeDays}
                      onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background"
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={60}>Last 60 days</option>
                      <option value={100}>Last 100 days</option>
                    </select>
                  </div>
                  <div className="flex-1 flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceRescrape}
                        onChange={(e) => setForceRescrape(e.target.checked)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm font-medium">Force Rescrape (ignore cache)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content-flow" className="space-y-6" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full grid-cols-4 mobile-tabs bg-card/60 backdrop-blur-sm ${accentColor}`}>
            <TabsTrigger value="content-flow" className="relative">
              Content Flow
              {needsAttention.contentFlow && (
                <Badge className="ml-2 h-4 w-4 p-0 bg-orange-500 hover:bg-orange-600">
                  <AlertCircle className="h-2 w-2" />
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="automation" className="relative">
              Automation
              {needsAttention.automation && (
                <Badge className="ml-2 h-4 w-4 p-0 bg-orange-500 hover:bg-orange-600">
                  <AlertCircle className="h-2 w-2" />
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="advanced" className="relative">
              Advanced Tools
              {needsAttention.advanced && (
                <Badge className="ml-2 h-4 w-4 p-0 bg-orange-500 hover:bg-orange-600">
                  <AlertCircle className="h-2 w-2" />
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="donations">
              Donations
            </TabsTrigger>
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
            
            {/* Gathering Progress Indicator */}
            {showGatheringProgress && (
              <GatheringProgressIndicator 
                topicId={topic.id}
                jobRunId={jobRunId}
                isVisible={showGatheringProgress}
                onComplete={() => {
                  setShowGatheringProgress(false);
                  setGatheringAll(false);
                  setJobRunId(null);
                  loadTopicAndStats();
                  toast({
                    title: "Gathering Complete",
                    description: "All sources have been processed",
                  });
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

            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Content Sources
                </CardTitle>
                <CardDescription>
                  Manage sources, view publication patterns, and monitor source health
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TopicAwareSourceManager 
                  selectedTopicId={topic.id}
                  onSourcesChange={loadTopicAndStats}
                />
              </CardContent>
            </Card>

            <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Sentiment Tracking
                </CardTitle>
                <CardDescription>
                  Auto-discover trending keywords and generate insight cards weekly
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SentimentManager topicId={topic.id} />
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      Audience
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="mt-2 text-lg font-semibold capitalize">
                      {topic.audience_expertise || 'Not set'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tailor reading level and expertise expectations for this topic.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      Voice & Tone
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="mt-2 text-lg font-semibold capitalize">
                      {topic.default_tone || 'Not set'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Writing style: <span className="font-medium capitalize">{topic.default_writing_style || 'Not set'}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      Automation
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {topic.auto_simplify_enabled ? 'Smart summaries on' : 'Manual review'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quality threshold: <span className="font-medium">{topic.automation_quality_threshold ?? 'Default'}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      Keyword Coverage
                      <Target className="h-4 w-4" />
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {(topic.keywords?.length || 0)} keywords
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optimise sourcing and ranking with focused keyword sets.
                    </p>
                  </div>
                </div>

                <Accordion type="multiple" defaultValue={["core-settings", "engagement"]} className="space-y-3">
                  <AccordionItem value="core-settings" className="overflow-hidden rounded-lg border border-border/60 bg-background/50 backdrop-blur">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex w-full items-start justify-between gap-3 text-left">
                        <div className="flex items-center gap-3">
                          <Settings className="h-4 w-4" />
                          <div>
                            <p className="text-sm font-medium">Core topic preferences</p>
                            <p className="text-xs text-muted-foreground">Audience expertise, tone, automation and community controls</p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <TopicSettings
                        topicId={topic.id}
                        currentExpertise={topic.audience_expertise}
                        currentTone={topic.default_tone}
                        currentWritingStyle={topic.default_writing_style}
                        currentCommunityEnabled={topic.community_intelligence_enabled}
                        currentCommunityPulseFrequency={topic.community_pulse_frequency}
                        currentCommunityConfig={topic.community_config}
                        currentAutoSimplifyEnabled={topic.auto_simplify_enabled}
                        currentAutomationQualityThreshold={topic.automation_quality_threshold}
                        currentParliamentaryTrackingEnabled={topic.parliamentary_tracking_enabled}
                        currentEventsEnabled={(topic as any).events_enabled}
                        topicType={topic.topic_type}
                        region={topic.region}
                        onUpdate={() => loadTopicAndStats()}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="branding" className="overflow-hidden rounded-lg border border-border/60 bg-background/50 backdrop-blur">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex w-full items-start justify-between gap-3 text-left">
                        <div className="flex items-center gap-3">
                          <Palette className="h-4 w-4" />
                          <div>
                            <p className="text-sm font-medium">Branding & presentation</p>
                            <p className="text-xs text-muted-foreground">Logos, colours and story-level visuals</p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <TopicBrandingSettings
                        topic={{
                          id: topic.id,
                          name: topic.name,
                          branding_config: topic.branding_config
                        }}
                        onUpdate={() => loadTopicAndStats()}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="keywords" className="overflow-hidden rounded-lg border border-border/60 bg-background/50 backdrop-blur">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex w-full items-start justify-between gap-3 text-left">
                        <div className="flex items-center gap-3">
                          <Hash className="h-4 w-4" />
                          <div>
                            <p className="text-sm font-medium">Keywords & discovery</p>
                            <p className="text-xs text-muted-foreground">Primary keywords, exclusions and competitive regions</p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 px-4 pb-4">
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
                    </AccordionContent>
                  </AccordionItem>


                  {topic.topic_type === 'regional' && topic.region && topic.parliamentary_tracking_enabled && (
                    <AccordionItem value="parliamentary" className="overflow-hidden rounded-lg border border-border/60 bg-background/50 backdrop-blur">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex w-full items-start justify-between gap-3 text-left">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4" />
                            <div>
                              <p className="text-sm font-medium">Parliamentary tracking</p>
                              <p className="text-xs text-muted-foreground">Backfill local representatives and speeches</p>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <ParliamentaryBackfillTrigger
                          topicId={topic.id}
                          region={topic.region}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </CardContent>
            </Card>



            <Collapsible open={!subscribersCollapsed} onOpenChange={(open) => setSubscribersCollapsed(!open)}>
              <Card className={`${accentColor} bg-card/60 backdrop-blur-sm`}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Topic Subscribers
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${subscribersCollapsed ? '' : 'rotate-180'}`} />
                    </CardTitle>
                    <CardDescription>
                      View and manage users who have subscribed to notifications for this topic
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <NewsletterSignupsManager topicId={topic.id} />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
            </TabsContent>

          <TabsContent value="donations" className="space-y-6">
            <TopicDonationSettings
              topicId={topic.id}
              donationEnabled={topic.donation_enabled || false}
              donationConfig={topic.donation_config || { button_text: "Support this feed", tiers: [] }}
              onUpdate={loadTopicAndStats}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => {
          confirmPublishToggle(pendingPublishState);
          setShowConfirmDialog(false);
        }}
        title="Unpublish Feed"
        description="This will make your feed private and remove it from public access. Subscribers won't be able to view new content. Are you sure?"
        confirmText="Unpublish"
        variant="destructive"
      />
    </div>
  );
};

export default TopicDashboard;