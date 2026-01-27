import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
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
import { AppLayout } from "@/components/AppLayout";
import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";
import { ManualContentStaging } from "@/components/ManualContentStaging";
import { GatheringProgressIndicator } from "@/components/GatheringProgressIndicator";
import { KeywordManager } from "@/components/KeywordManager";
import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { TopicBrandingSettings } from "@/components/TopicBrandingSettings";
import { OnboardingSettings } from "@/components/onboarding";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { TopicCompetingRegions } from "@/components/TopicCompetingRegions";
import { TopicDonationSettings } from "@/components/TopicDonationSettings";
import { TopicInsightSettings } from "@/components/TopicInsightSettings";
// AudienceProgressCard removed - functionality merged into TopicInsightSettings
import { ContentVoiceSettings } from "@/components/ContentVoiceSettings";
import { CommunityVoiceSettings } from "@/components/CommunityVoiceSettings";
import { RegionalFeaturesSettings } from "@/components/RegionalFeaturesSettings";
import { SentimentKeywordSettings } from "@/components/SentimentKeywordSettings";
import { TopicAutomationSettings } from "@/components/TopicAutomationSettings";
import { DripFeedSettings } from "@/components/DripFeedSettings";
import { TrendingKeywordsReview } from "@/components/TrendingKeywordsReview";
import { WidgetAnalytics } from "@/components/WidgetAnalytics";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParliamentaryAutomation } from "@/hooks/useParliamentaryAutomation";
import { usePageFavicon } from "@/hooks/usePageFavicon";
import { useDripFeedPublishSound } from "@/hooks/useDripFeedPublishSound";
import { BarChart3, Settings, FileText, Users, ExternalLink, MapPin, Hash, Clock, CheckCircle, ChevronDown, Loader2, RefreshCw, Activity, Database, Globe, Play, MessageCircle, AlertCircle, Eye, EyeOff, Palette, Target, Sparkles, Code, Rss, Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ILLUSTRATION_STYLES, type IllustrationStyle } from "@/lib/constants/illustrationStyles";

interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  sentiment_cards: number;
  email_subscribers_daily?: number;
  email_subscribers_weekly?: number;
  email_subscribers_total?: number;
  email_signups_today?: number;
  email_signups_week?: number;
  donation_button_clicks?: number;
  donation_modal_opens?: number;
  liked_stories?: number;
  total_swipes?: number;
  shared_stories?: number;
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
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  illustration_style?: IllustrationStyle;
  illustration_primary_color?: string;
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
  drip_feed_enabled?: boolean;
  public_widget_builder_enabled?: boolean;
  rss_enabled?: boolean;
  email_subscriptions_enabled?: boolean;
}

const SCRAPING_WINDOW_OPTIONS = new Set([7, 30, 60, 100]);

interface ScraperSummary {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  totalArticlesFound: number;
  totalArticlesStored: number;
  totalArticlesSkipped: number;
  executionTimeMs: number;
}

interface UniversalScraperResponse {
  success?: boolean;
  status?: 'success' | 'partial_success' | 'failure';
  message?: string;
  summary?: ScraperSummary;
  warnings?: string[];
  errors?: string[];
}

const TopicDashboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
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
    sentiment_cards: 0,
    liked_stories: 0,
    total_swipes: 0,
    shared_stories: 0
  });
  const [loading, setLoading] = useState(true);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [activeTab, setActiveTab] = useState("content-flow");
  const [subscribersCollapsed, setSubscribersCollapsed] = useState(true);
  const [autoSuggestSources, setAutoSuggestSources] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingPublishState, setPendingPublishState] = useState<boolean>(false);
  const { toast } = useToast();
  
  // Set Curatr favicon for topic dashboard (auth page)
  usePageFavicon();

  // Set up parliamentary automation when enabled
  useParliamentaryAutomation({
    topicId: topic?.id || '',
    enabled: topic?.topic_type === 'regional' && topic?.parliamentary_tracking_enabled === true,
    region: topic?.region
  });

  // Play subtle chime when drip feed stories publish
  useDripFeedPublishSound(topic?.id, topic?.drip_feed_enabled === true);

  useEffect(() => {
    if (slug && user) {
      loadTopicAndStats();
    }
  }, [slug, user]);

  // Handle sources redirect from topic creation
  useEffect(() => {
    if (searchParams.get('sources') === 'true') {
      setActiveTab('automation');
      setAutoSuggestSources(true);
      // Clean the URL
      searchParams.delete('sources');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadTopicAndStats = async () => {
    try {
      // Load topic
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*, auto_simplify_enabled, automation_quality_threshold, branding_config, donation_enabled, donation_config, community_config, community_pulse_frequency, illustration_style, illustration_primary_color, drip_feed_enabled, rss_enabled, email_subscriptions_enabled')
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
        illustration_style: (topicData.illustration_style as IllustrationStyle) || ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE,
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

      // Get actual arrivals count - only 'new' articles not yet queued or published
      const { data: allNewArticles } = await supabase
        .from('topic_articles')
        .select('id, import_metadata')
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new'); // Only count 'new' status as "to process"
      
      if (!allNewArticles) {
        console.error('Failed to fetch topic articles');
        return;
      }

      // Get IDs of articles already published or queued
      const newArticleIds = allNewArticles.map(a => a.id).filter(id => id && id.length > 0);
      
      let publishedIds = new Set<string>();
      let queuedIds = new Set<string>();
      
      // Only query if we have valid article IDs
      if (newArticleIds.length > 0) {
        const { data: allPublishedStories } = await supabase
          .from('stories')
          .select('topic_article_id')
          .in('status', ['published', 'ready'])
          .in('topic_article_id', newArticleIds);
        
        publishedIds = new Set((allPublishedStories || [])
          .map(s => s.topic_article_id)
          .filter((id): id is string => !!id));
        
        const { data: queuedItems } = await supabase
          .from('content_generation_queue')
          .select('topic_article_id')
          .in('status', ['pending', 'processing'])
          .in('topic_article_id', newArticleIds);
        
        queuedIds = new Set((queuedItems || [])
          .map(q => q.topic_article_id)
          .filter((id): id is string => !!id));
      }
      
      // Filter out parliamentary, published, and queued articles
      const availableArticles = allNewArticles.filter(article => {
        const metadata = article.import_metadata as any || {};
        const isParliamentary = metadata.source === 'parliamentary_vote' || 
                               metadata.parliamentary_vote === true ||
                               metadata.source === 'parliamentary_weekly_roundup';
        return !isParliamentary && 
               !publishedIds.has(article.id) && 
               !queuedIds.has(article.id);
      });
      
      const arrivalsRes = { count: availableArticles.length };

      // Get stories in last 24h - query directly through topic_articles join
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const simplifiedRes = await supabase
        .from('stories')
        .select('id, topic_articles!inner(topic_id)', { count: 'exact' })
        .eq('topic_articles.topic_id', topicData.id)
        .gte('created_at', yesterday.toISOString())
        .not('topic_article_id', 'is', null);

      // Get sentiment cards count
      const sentimentRes = await supabase
        .from('sentiment_cards')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      // Get email subscriber stats
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const { count: dailySubscribers } = await supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('notification_type', 'daily')
        .eq('is_active', true)
        .not('email', 'is', null);

      const { count: weeklySubscribers } = await supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('notification_type', 'weekly')
        .eq('is_active', true)
        .not('email', 'is', null);

      const { count: totalEmailSubscribers } = await supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null);

      const { count: signupsToday } = await supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null)
        .gte('created_at', today.toISOString());

      const { count: signupsWeek } = await supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null)
        .gte('created_at', weekAgo.toISOString());

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

      // Get swipe mode engagement stats
      const { count: likedStories } = await supabase
        .from('story_swipes')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('swipe_type', 'like');

      const { count: totalSwipes } = await supabase
        .from('story_swipes')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id);

      const { data: sharedStories } = await supabase
        .from('story_interactions')
        .select('story_id')
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'share_click');
      
      const uniqueSharedStories = new Set(sharedStories?.map(s => s.story_id) || []).size;

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesCount || 0,
        pending_articles: pendingArticlesRes.count || 0,
        processing_queue: queueRes.count || 0,
        ready_stories: readyStoriesRes.count || 0,
        simplified_stories_24h: simplifiedRes.count || 0,
        sentiment_cards: sentimentRes.count || 0,
        email_subscribers_daily: dailySubscribers || 0,
        email_subscribers_weekly: weeklySubscribers || 0,
        email_subscribers_total: totalEmailSubscribers || 0,
        email_signups_today: signupsToday || 0,
        email_signups_week: signupsWeek || 0,
        donation_button_clicks: donationButtonClicks || 0,
        donation_modal_opens: donationModalOpens || 0,
        liked_stories: likedStories || 0,
        total_swipes: totalSwipes || 0,
        shared_stories: uniqueSharedStories,
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
    setJobRunId(null);
    try {
      toast({
        title: "Scraping Started",
        description: `Gathering content from last ${maxAgeDays} days across all sources. This runs asynchronously and may take a few minutes.`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
        body: {
          topicIds: [topic.id],
          force: forceRescrape,
          dryRun: false,
          maxAgeDays
        }
      });

      if (error) throw error;

      const jobId = data?.jobRunId;
      if (jobId) {
        setJobRunId(jobId);
      }

      toast({
        title: "Scraping Job Started",
        description: "Content gathering is running in the background. Dashboard will update automatically.",
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
            <h1 className="text-4xl font-bold text-foreground">Access Denied</h1>
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
            <h1 className="text-4xl font-bold text-foreground">Topic Not Found</h1>
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

  // Progressive disclosure logic (for potential future use)
  const hasEnoughArticles = stats.articles > 10;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
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

        {/* Topic Header - Clean, out of card */}
        <div className="mb-8 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-5">
              {topic.branding_config?.icon_url ? (
                <img 
                  src={topic.branding_config.icon_url} 
                  alt={`${topic.name} favicon`}
                  className="w-14 h-14 rounded-lg object-cover shadow-sm border border-border mt-1"
                />
              ) : topic.topic_type === 'regional' ? (
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[hsl(270,100%,68%)] to-[hsl(270,80%,55%)] flex items-center justify-center shadow-sm mt-1">
                  <MapPin className="w-7 h-7 text-white" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[hsl(155,100%,67%)] to-[hsl(155,80%,50%)] flex items-center justify-center shadow-sm mt-1">
                  <Hash className="w-7 h-7 text-white" />
                </div>
              )}
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                  {topic.name}
                </h1>
                {topic.description && (
                  <p className="text-muted-foreground text-sm max-w-xl">
                    {topic.description}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Badge 
                    variant={topic.is_public ? "default" : "secondary"} 
                    className={topic.is_public 
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                      : "bg-muted text-muted-foreground"
                    }
                  >
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
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {topic.is_public ? 'Live' : 'Draft'}
                    </span>
                    <Switch
                      id="publish-toggle"
                      checked={topic.is_public}
                      onCheckedChange={handlePublishToggle}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button variant="outline" asChild className="shrink-0 hover:bg-primary/5 hover:text-primary hover:border-primary/30">
              <Link to={`/feed/${topic.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-2" />
                View Feed
              </Link>
            </Button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="content-flow" className="space-y-6" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 h-12 p-1 bg-muted/50 rounded-lg">
            <TabsTrigger 
              value="content-flow" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md font-medium"
            >
              Content Flow
            </TabsTrigger>
            <TabsTrigger 
              value="automation" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md font-medium"
            >
              Sources
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md font-medium"
            >
              Advanced Tools
            </TabsTrigger>
          </TabsList>


          <TabsContent value="content-flow" className="space-y-6">
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
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <UnifiedContentPipeline selectedTopicId={topic.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <TopicAwareSourceManager
                  selectedTopicId={topic.id}
                  onSourcesChange={loadTopicAndStats}
                  topicName={topic.name}
                  description={topic.description || ''}
                  keywords={topic.keywords || []}
                  topicType={topic.topic_type}
                  region={topic.region}
                  articleCount={stats?.articles || 0}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            {/* Mobile-optimized accordion sections */}
            <Accordion type="multiple" defaultValue={["content-voice"]} className="space-y-3">
              
              {/* Content & Voice */}
              <AccordionItem value="content-voice" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>div>svg]:rotate-0">
                  <div className="flex items-center gap-3 text-left">
                    <Settings className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Content & Voice</p>
                      <p className="text-xs text-muted-foreground truncate">Expertise, tone, style, visuals</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <ContentVoiceSettings
                    topicId={topic.id}
                    currentExpertise={topic.audience_expertise}
                    currentTone={topic.default_tone}
                    currentWritingStyle={topic.default_writing_style}
                    currentIllustrationStyle={topic.illustration_style}
                    onUpdate={() => loadTopicAndStats()}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Automation & Scheduling */}
              <AccordionItem value="automation" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Clock className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Automation & Scheduling</p>
                      <p className="text-xs text-muted-foreground truncate">Publishing mode, drip feed, backfill</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-6">
                  <TopicAutomationSettings topicId={topic.id} />
                  <div className="border-t pt-4">
                    <DripFeedSettings topicId={topic.id} onUpdate={() => loadTopicAndStats()} />
                  </div>
                  <div className="border-t pt-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">Manual Backfill</p>
                        <p className="text-xs text-muted-foreground">Gather historical content with custom settings</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select 
                          value={maxAgeDays}
                          onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                          className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                        >
                          <option value={7}>Last 7 days</option>
                          <option value={30}>Last 30 days</option>
                          <option value={60}>Last 60 days</option>
                          <option value={100}>Last 100 days</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={forceRescrape}
                            onChange={(e) => setForceRescrape(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          Force rescrape
                        </label>
                      </div>
                      <Button onClick={handleStartScraping} disabled={gatheringAll} variant="outline" size="sm" className="w-full sm:w-auto">
                        {gatheringAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        {gatheringAll ? 'Running...' : 'Run Backfill'}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Presentation & Reach */}
              <AccordionItem value="presentation" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Palette className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Presentation & Reach</p>
                      <p className="text-xs text-muted-foreground truncate">Branding, widgets, onboarding, donations</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-6">
                  <TopicBrandingSettings
                    topic={{ id: topic.id, name: topic.name, illustration_primary_color: topic.illustration_primary_color, branding_config: topic.branding_config }}
                    onUpdate={() => loadTopicAndStats()}
                  />
                  
                  {/* Widget Builder Toggle */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Code className="w-4 h-4" />
                          Public Widget Builder
                        </Label>
                        <p className="text-xs text-muted-foreground">Allow anyone to create embed widgets for this feed</p>
                      </div>
                      <Switch
                        checked={topic.public_widget_builder_enabled || false}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from('topics')
                            .update({ public_widget_builder_enabled: checked })
                            .eq('id', topic.id);
                          if (!error) {
                            loadTopicAndStats();
                            toast({ title: checked ? "Widget builder enabled" : "Widget builder disabled" });
                          }
                        }}
                      />
                    </div>
                    {topic.public_widget_builder_enabled && (
                      <div className="mt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/feed/${topic.slug}/widget`} target="_blank">
                            <ExternalLink className="w-3 h-3 mr-2" />
                            Open Widget Builder
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Widget Analytics - show when widget builder is enabled */}
                  {topic.public_widget_builder_enabled && (
                    <div className="border-t pt-4">
                      <Label className="flex items-center gap-2 text-sm font-medium mb-3">
                        <BarChart3 className="w-4 h-4" />
                        Widget Performance
                      </Label>
                      <WidgetAnalytics 
                        topicId={topic.id} 
                        onNewSiteDetected={(domain) => {
                          toast({
                            title: "New widget integration!",
                            description: `Your widget is now live on ${domain}`,
                          });
                        }}
                      />
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-4">
                    <Label className="text-sm font-medium">Distribution Channels</Label>
                    
                    {/* RSS Feed Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2 text-sm">
                          <Rss className="w-4 h-4" />
                          RSS Feed
                        </Label>
                        <p className="text-xs text-muted-foreground">Allow subscribers to access this feed via RSS</p>
                      </div>
                      <Switch
                        checked={topic.rss_enabled || false}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from('topics')
                            .update({ rss_enabled: checked })
                            .eq('id', topic.id);
                          if (!error) {
                            loadTopicAndStats();
                            toast({ title: checked ? "RSS feed enabled" : "RSS feed disabled" });
                          }
                        }}
                      />
                    </div>

                    {/* Email Subscriptions Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4" />
                          Email Subscriptions
                        </Label>
                        <p className="text-xs text-muted-foreground">Allow readers to subscribe to email newsletters</p>
                      </div>
                      <Switch
                        checked={topic.email_subscriptions_enabled || false}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from('topics')
                            .update({ email_subscriptions_enabled: checked })
                            .eq('id', topic.id);
                          if (!error) {
                            loadTopicAndStats();
                            toast({ title: checked ? "Email subscriptions enabled" : "Email subscriptions disabled" });
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <OnboardingSettings
                      topic={{ id: topic.id, name: topic.name, slug: topic.slug, branding_config: topic.branding_config }}
                      onUpdate={() => loadTopicAndStats()}
                    />
                  </div>
                  <div className="border-t pt-4">
                    <TopicDonationSettings
                      topicId={topic.id}
                      donationEnabled={topic.donation_enabled || false}
                      donationConfig={topic.donation_config || { button_text: "Support this feed", tiers: [] }}
                      onUpdate={loadTopicAndStats}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Feed Insight Cards */}
              <AccordionItem value="insights" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Feed Insight Cards</p>
                      <p className="text-xs text-muted-foreground truncate">Quiz, momentum, social proof controls</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <TopicInsightSettings topicId={topic.id} />
                </AccordionContent>
              </AccordionItem>

              {/* Keywords & Discovery */}
              <AccordionItem value="keywords" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Hash className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Keywords & Discovery</p>
                      <p className="text-xs text-muted-foreground truncate">Keywords, exclusions, sentiment</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  <KeywordManager
                    topic={topic}
                    onTopicUpdate={(updatedTopic: Topic) => {
                      setTopic((prevTopic) => ({ ...prevTopic!, ...updatedTopic }));
                      loadTopicAndStats();
                    }}
                  />
                  
                  {topic.topic_type === 'regional' && (
                    <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
                      <TopicNegativeKeywords topicId={topic.id} negativeKeywords={negativeKeywords} onUpdate={setNegativeKeywords} />
                      <TopicCompetingRegions topicId={topic.id} competingRegions={competingRegions} onUpdate={setCompetingRegions} />
                    </div>
                  )}
                  
                  <div className="border-t pt-4">
                    <SentimentKeywordSettings topicId={topic.id} />
                  </div>
                  
                  <div className="border-t pt-4">
                    <CommunityVoiceSettings
                      topicId={topic.id}
                      enabled={topic.community_intelligence_enabled}
                      pulseFrequency={topic.community_pulse_frequency}
                      config={topic.community_config}
                      topicType={topic.topic_type}
                      region={topic.region}
                      onUpdate={() => loadTopicAndStats()}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>


              {/* Regional Features - only for regional topics */}
              {topic.topic_type === 'regional' && (
                <AccordionItem value="regional" className="rounded-lg border bg-card">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Regional Features</p>
                        <p className="text-xs text-muted-foreground truncate">Parliamentary tracking, events</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <RegionalFeaturesSettings
                      topicId={topic.id}
                      region={topic.region}
                      parliamentaryEnabled={topic.parliamentary_tracking_enabled}
                      eventsEnabled={(topic as any).events_enabled}
                      onUpdate={() => loadTopicAndStats()}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Subscribers */}
              <AccordionItem value="subscribers" className="rounded-lg border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Users className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Subscribers</p>
                      <p className="text-xs text-muted-foreground truncate">Manage notification subscribers</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <NewsletterSignupsManager topicId={topic.id} />
                </AccordionContent>
              </AccordionItem>

            </Accordion>
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
      
      {/* Subtle Curatr.pro branding */}
      <div className="mt-12 pb-6 text-center">
        <p className="text-xs text-muted-foreground/50">
          Powered by <span className="font-display font-medium text-muted-foreground/70">Curatr</span><span className="font-display font-light text-muted-foreground/70">.pro</span>
        </p>
      </div>
        </div>
    </AppLayout>
  );
};

export default TopicDashboard;