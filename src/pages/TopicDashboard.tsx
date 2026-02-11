import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { ExternalLink, MapPin, Hash, Clock, ChevronDown, Loader2, Globe, Code, Rss, Mail, Volume2, Users, Palette, Sparkles, Settings } from "lucide-react";
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
  branding_config?: any;
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
    articles: 0, stories: 0, sources: 0, pending_articles: 0,
    processing_queue: 0, ready_stories: 0, simplified_stories_24h: 0,
    sentiment_cards: 0, liked_stories: 0, total_swipes: 0, shared_stories: 0
  });
  const [loading, setLoading] = useState(true);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [activeTab, setActiveTab] = useState("feed");
  const [autoSuggestSources, setAutoSuggestSources] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingPublishState, setPendingPublishState] = useState<boolean>(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const { toast } = useToast();
  
  usePageFavicon();

  useParliamentaryAutomation({
    topicId: topic?.id || '',
    enabled: topic?.topic_type === 'regional' && topic?.parliamentary_tracking_enabled === true,
    region: topic?.region
  });

  useDripFeedPublishSound(topic?.id, topic?.drip_feed_enabled === true);

  useEffect(() => {
    if (slug && user) {
      loadTopicAndStats();
    }
  }, [slug, user]);

  useEffect(() => {
    if (searchParams.get('sources') === 'true') {
      setActiveTab('feed');
      setSourcesExpanded(true);
      setAutoSuggestSources(true);
      searchParams.delete('sources');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadTopicAndStats = async () => {
    try {
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*, auto_simplify_enabled, automation_quality_threshold, branding_config, donation_enabled, donation_config, community_config, community_pulse_frequency, illustration_style, illustration_primary_color, drip_feed_enabled, rss_enabled, email_subscriptions_enabled')
        .eq('slug', slug)
        .single();

      if (topicError) {
        if (topicError.code === 'PGRST116') throw new Error('Topic not found');
        throw topicError;
      }

      const hasAdminAccess = topicData.created_by === user?.id || isAdmin;
      if (!hasAdminAccess) {
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

      const articlesRes = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicData.id);

      const topicArticleIds = topicArticles?.map(a => a.id) || [];

      const storiesRes = topicArticleIds.length > 0 ? await supabase
        .from('stories')
        .select('id', { count: 'exact' })
        .in('topic_article_id', topicArticleIds) : { count: 0 };

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

      const { data: allNewArticles } = await supabase
        .from('topic_articles')
        .select('id, import_metadata')
        .eq('topic_id', topicData.id)
        .eq('processing_status', 'new');
      
      if (!allNewArticles) {
        console.error('Failed to fetch topic articles');
        return;
      }

      const newArticleIds = allNewArticles.map(a => a.id).filter(id => id && id.length > 0);
      
      let publishedIds = new Set<string>();
      let queuedIds = new Set<string>();
      
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

      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const simplifiedRes = await supabase
        .from('stories')
        .select('id, topic_articles!inner(topic_id)', { count: 'exact' })
        .eq('topic_articles.topic_id', topicData.id)
        .gte('created_at', yesterday.toISOString())
        .not('topic_article_id', 'is', null);

      const sentimentRes = await supabase
        .from('sentiment_cards')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id);

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
        description: `Gathering content from last ${maxAgeDays} days across all sources.`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
        body: { topicIds: [topic.id], force: forceRescrape, dryRun: false, maxAgeDays }
      });

      if (error) throw error;
      const jobId = data?.jobRunId;
      if (jobId) setJobRunId(jobId);

      toast({
        title: "Scraping Job Started",
        description: "Content gathering is running in the background.",
      });

      const refreshInterval = setInterval(() => { loadTopicAndStats(); }, 5000);
      setTimeout(() => { clearInterval(refreshInterval); setGatheringAll(false); }, 60000);
      
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
      setPendingPublishState(newState);
      setShowConfirmDialog(true);
    } else {
      confirmPublishToggle(newState);
    }
  };

  const confirmPublishToggle = async (newState: boolean) => {
    if (!topic) return;
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_public: newState, is_active: newState })
        .eq('id', topic.id);
      if (error) throw error;
      setTopic(prev => prev ? { ...prev, is_public: newState, is_active: newState } : null);
      toast({ title: "Success", description: `Feed ${newState ? 'published' : 'unpublished'}` });
    } catch (error) {
      console.error('Error updating publish status:', error);
      toast({ title: "Error", description: "Failed to update publish status", variant: "destructive" });
    }
  };

  // Inline toggle helper for distribution channels
  const handleChannelToggle = async (field: string, checked: boolean, label: string) => {
    const { error } = await supabase
      .from('topics')
      .update({ [field]: checked })
      .eq('id', topic!.id);
    if (!error) {
      loadTopicAndStats();
      toast({ title: `${label} ${checked ? 'enabled' : 'disabled'}` });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">Please log in to access the topic dashboard.</p>
          <Button asChild><Link to="/auth">Sign In</Link></Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Topic Not Found</h1>
          <p className="text-muted-foreground">The topic you're looking for doesn't exist or you don't have access.</p>
          <Button asChild><Link to="/dashboard">Back to Dashboard</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">

          {/* Simplified Header — name + toggle + view feed icon */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">{topic.name}</h1>
              <Switch
                id="publish-toggle"
                checked={topic.is_public}
                onCheckedChange={handlePublishToggle}
              />
            </div>
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/feed/${topic.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* 2 Tabs: Feed + Settings */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="w-full grid grid-cols-2 h-10 p-1 bg-muted/50 rounded-lg">
              <TabsTrigger value="feed" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-sm font-medium">
                Feed
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md text-sm font-medium">
                Settings
              </TabsTrigger>
            </TabsList>

            {/* ===== FEED TAB ===== */}
            <TabsContent value="feed" className="space-y-6">
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
                    toast({ title: "Gathering Complete", description: "All sources have been processed" });
                  }}
                />
              )}
              
              <ManualContentStaging 
                topicId={topic.id} 
                onContentProcessed={loadTopicAndStats}
              />

              <Card className="bg-card border-border">
                <CardContent className="p-6">
                  <UnifiedContentPipeline selectedTopicId={topic.id} />
                </CardContent>
              </Card>

              {/* Sources — collapsible section within Feed tab */}
              <Collapsible open={sourcesExpanded} onOpenChange={setSourcesExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto">
                    <span className="text-sm font-medium">Sources</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${sourcesExpanded ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="bg-card border-border mt-2">
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
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            {/* ===== SETTINGS TAB — flat sections ===== */}
            <TabsContent value="settings" className="space-y-8">

              {/* Voice */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Voice</h3>
                <ContentVoiceSettings
                  topicId={topic.id}
                  currentExpertise={topic.audience_expertise}
                  currentTone={topic.default_tone}
                  currentWritingStyle={topic.default_writing_style}
                  currentIllustrationStyle={topic.illustration_style}
                  onUpdate={() => loadTopicAndStats()}
                />
              </section>

              {/* Automation */}
              <section className="border-t pt-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Automation</h3>
                <div className="space-y-6">
                  <TopicAutomationSettings topicId={topic.id} />
                  <DripFeedSettings topicId={topic.id} onUpdate={() => loadTopicAndStats()} />
                </div>
              </section>

              {/* Channels */}
              <section className="border-t pt-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Channels</h3>
                <div className="space-y-4">
                  {/* Widget Builder */}
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm"><Code className="w-4 h-4" />Widget Builder</Label>
                    <Switch
                      checked={topic.public_widget_builder_enabled || false}
                      onCheckedChange={(checked) => handleChannelToggle('public_widget_builder_enabled', checked, 'Widget builder')}
                    />
                  </div>
                  {topic.public_widget_builder_enabled && (
                    <>
                      <Button variant="outline" size="sm" asChild className="ml-6">
                        <Link to={`/feed/${topic.slug}/widget`} target="_blank">
                          <ExternalLink className="w-3 h-3 mr-2" />Open Widget Builder
                        </Link>
                      </Button>
                      <div className="ml-6">
                        <WidgetAnalytics 
                          topicId={topic.id} 
                          onNewSiteDetected={(domain) => toast({ title: "New widget integration!", description: `Your widget is now live on ${domain}` })}
                        />
                      </div>
                    </>
                  )}

                  {/* RSS */}
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm"><Rss className="w-4 h-4" />RSS Feed</Label>
                    <Switch
                      checked={topic.rss_enabled || false}
                      onCheckedChange={(checked) => handleChannelToggle('rss_enabled', checked, 'RSS feed')}
                    />
                  </div>

                  {/* Email */}
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4" />Email Subscriptions</Label>
                    <Switch
                      checked={topic.email_subscriptions_enabled || false}
                      onCheckedChange={(checked) => handleChannelToggle('email_subscriptions_enabled', checked, 'Email subscriptions')}
                    />
                  </div>

                  {/* Audio — daily */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2"><Volume2 className="w-4 h-4" />Daily Audio Briefings</Label>
                    <Switch
                      checked={(topic as any).audio_briefings_daily_enabled || false}
                      onCheckedChange={(checked) => handleChannelToggle('audio_briefings_daily_enabled', checked, 'Daily audio briefings')}
                    />
                  </div>

                  {/* Audio — weekly */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2"><Volume2 className="w-4 h-4" />Weekly Audio Briefings</Label>
                    <Switch
                      checked={(topic as any).audio_briefings_weekly_enabled || false}
                      onCheckedChange={(checked) => handleChannelToggle('audio_briefings_weekly_enabled', checked, 'Weekly audio briefings')}
                    />
                  </div>

                  {/* Donations */}
                  <div className="border-t pt-4">
                    <TopicDonationSettings
                      topicId={topic.id}
                      donationEnabled={topic.donation_enabled || false}
                      donationConfig={topic.donation_config || { button_text: "Support this feed", tiers: [] }}
                      onUpdate={loadTopicAndStats}
                    />
                  </div>
                </div>
              </section>

              {/* More — set-once-and-forget settings */}
              <section className="border-t pt-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">More</h3>
                <div className="space-y-6">
                  {/* Branding & Onboarding */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between px-0 h-auto py-2">
                        <span className="flex items-center gap-2 text-sm font-medium"><Palette className="w-4 h-4" />Branding & Onboarding</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-6">
                      <TopicBrandingSettings
                        topic={{ id: topic.id, name: topic.name, illustration_primary_color: topic.illustration_primary_color, branding_config: topic.branding_config }}
                        onUpdate={() => loadTopicAndStats()}
                      />
                      <OnboardingSettings
                        topic={{ id: topic.id, name: topic.name, slug: topic.slug, branding_config: topic.branding_config }}
                        onUpdate={() => loadTopicAndStats()}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Insight Cards */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between px-0 h-auto py-2">
                        <span className="flex items-center gap-2 text-sm font-medium"><Sparkles className="w-4 h-4" />Insight Cards</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <TopicInsightSettings topicId={topic.id} />
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Keywords & Discovery */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between px-0 h-auto py-2">
                        <span className="flex items-center gap-2 text-sm font-medium"><Hash className="w-4 h-4" />Keywords & Discovery</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
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
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Regional Features — only for regional topics */}
                  {topic.topic_type === 'regional' && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between px-0 h-auto py-2">
                          <span className="flex items-center gap-2 text-sm font-medium"><MapPin className="w-4 h-4" />Regional Features</span>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4">
                        <RegionalFeaturesSettings
                          topicId={topic.id}
                          region={topic.region}
                          parliamentaryEnabled={topic.parliamentary_tracking_enabled}
                          eventsEnabled={(topic as any).events_enabled}
                          onUpdate={() => loadTopicAndStats()}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Subscribers */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between px-0 h-auto py-2">
                        <span className="flex items-center gap-2 text-sm font-medium"><Users className="w-4 h-4" />Subscribers</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <NewsletterSignupsManager topicId={topic.id} />
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </section>
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
