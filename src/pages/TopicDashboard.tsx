import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { ReadershipPanel } from "@/components/readership/ReadershipPanel";
import { TopicPulseProvider } from "@/hooks/useTopicPulse";
import { ReadingNow, MilestoneNote, DeskLookTracker } from "@/components/pulse/PulseBits";
import { useParams, Link, useSearchParams, useNavigate } from "@/lib/router-compat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/AppLayout";
import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";
import { AddStoryDialog } from "@/components/manual/AddStoryDialog";
import { GatheringProgressIndicator } from "@/components/GatheringProgressIndicator";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { FeedSetupGuide, storageKeyFor } from "@/components/onboarding/FeedSetupGuide";
import { EditorialControlCenter } from "@/components/topics/EditorialControlCenter";
import { settingsPath } from "@/lib/settingsSections";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { usePageFavicon } from "@/hooks/usePageFavicon";
import { useDripFeedPublishSound } from "@/hooks/useDripFeedPublishSound";
import { Loader2, Sparkles } from "lucide-react";
import { LiveFeedControl } from "@/components/feed/LiveFeedControl";
import { useToast } from "@/hooks/use-toast";
import { ILLUSTRATION_STYLES, type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { OwnerAssistant } from "@/components/assistant/OwnerAssistant";
import { ProGateDialog } from "@/components/billing/ProGateDialog";


interface TopicDashboardStats {
  articles: number;
  stories: number;
  sources: number;
  /** What's-on sources; a feed can run on events alone. */
  event_sources: number;
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  sentiment_cards: number;
  email_subscribers_daily?: number | undefined;
  email_subscribers_weekly?: number | undefined;
  email_subscribers_total?: number | undefined;
  email_signups_today?: number | undefined;
  email_signups_week?: number | undefined;
  donation_button_clicks?: number | undefined;
  donation_modal_opens?: number | undefined;
  liked_stories?: number | undefined;
  total_swipes?: number | undefined;
  shared_stories?: number | undefined;
}

interface Topic {
  id: string;
  name: string;
  description: string;
  slug: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  landmarks?: string[] | undefined;
  landmark_descriptions?: Record<string, string> | undefined;
  landmark_reference_images?: (Record<string, { url: string; credit?: string | undefined }[]>) | undefined;
  landmark_setup_state?: Record<string, any> | undefined;
  coverage_setup_state?: Record<string, any> | undefined;
  postcodes?: string[] | undefined;
  organizations?: string[] | undefined;
  negative_keywords?: string[] | undefined;
  competing_regions?: string[] | undefined;
  region?: string | undefined;
  is_public: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
  audience_expertise?: 'beginner' | 'intermediate' | 'expert' | undefined;
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined;
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined;
  illustration_style?: IllustrationStyle | undefined;
  illustration_primary_color?: string | undefined;
  community_intelligence_enabled?: boolean | undefined;
  community_pulse_frequency?: number | undefined;
  community_config?: {
    subreddits?: string[] | undefined;
    last_processed?: string | undefined;
    processing_frequency_hours?: number | undefined;
  };
  auto_simplify_enabled?: boolean | undefined;
  automation_quality_threshold?: number | undefined;
  parliamentary_tracking_enabled?: boolean | undefined;
  branding_config?: any | undefined;
  donation_enabled?: boolean | undefined;
  donation_config?: any | undefined;
  drip_feed_enabled?: boolean | undefined;
  public_widget_builder_enabled?: boolean | undefined;
  rss_enabled?: boolean | undefined;
  mcp_enabled?: boolean | undefined;
  mcp_access?: 'open' | 'key' | undefined;
  email_subscriptions_enabled?: boolean | undefined;
  audio_briefings_daily_enabled?: boolean | undefined;
  audio_briefings_weekly_enabled?: boolean | undefined;
  events_enabled?: boolean | undefined;
  event_source_url?: string | undefined;
  house_style_notes?: string | null | undefined;
  house_style_examples?: string | null | undefined;
  locality_strength?: number | undefined;
  nearby_places?: unknown | undefined;
  big_story_override?: boolean | undefined;
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
  success?: boolean | undefined;
  status?: 'success' | 'partial_success' | 'failure' | undefined;
  message?: string | undefined;
  summary?: ScraperSummary | undefined;
  warnings?: string[] | undefined;
  errors?: string[] | undefined;
}

const TopicDashboard = () => {
  const { slug, section: settingsSection } = useParams<{ slug: string; section?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [negativeKeywords, setNegativeKeywords] = useState<string[]>([]);
  const [competingRegions, setCompetingRegions] = useState<string[]>([]);
  const [stats, setStats] = useState<TopicDashboardStats>({
    articles: 0, stories: 0, sources: 0, event_sources: 0, pending_articles: 0,
    processing_queue: 0, ready_stories: 0, simplified_stories_24h: 0,
    sentiment_cards: 0, liked_stories: 0, total_swipes: 0, shared_stories: 0
  });
  const [loading, setLoading] = useState(true);
  const [gatheringAll, setGatheringAll] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (settingsSection) return 'settings';
    const requested = searchParams.get('tab');
    // Legacy deep links used ?tab=insights before the tab became Reviews.
    if (requested === 'insights' || requested === 'reviews') return 'settings';
    return requested || "feed";
  });
  const [autoSuggestSources, setAutoSuggestSources] = useState(false);
  const [proGateOpen, setProGateOpen] = useState(false);
  const { toast } = useToast();
  
  usePageFavicon();



  // Redirect unauthenticated users to auth page
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth?mode=signin', { replace: true });
    }
  }, [authLoading, user, navigate]);

  useDripFeedPublishSound(topic?.id, topic?.drip_feed_enabled === true);

  useEffect(() => {
    if (slug && user) {
      loadTopicAndStats();
    }
  }, [slug, user]);

  useEffect(() => {
    if (searchParams.get('sources') === 'true') {
      setActiveTab('sources');
      setAutoSuggestSources(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('sources');
      nextParams.set('tab', 'sources');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (settingsSection) { setActiveTab('settings'); return; }
    const tab = searchParams.get('tab');
    // Old ?tab=settings[&section=] links → the settings page that now holds them.
    if (tab === 'settings' && slug) {
      navigate(settingsPath(slug, searchParams.get('section')), { replace: true });
      return;
    }
    if ((tab === 'insights' || tab === 'reviews') && slug) {
      navigate(`${settingsPath(slug, 'extras')}#period-reviews`, { replace: true });
      return;
    }
    if (tab === 'feed' || tab === 'sources' || tab === 'stats' || tab === 'settings') setActiveTab(tab);
    if (!tab) setActiveTab('feed');
  }, [searchParams, setSearchParams, settingsSection, slug, navigate]);

  const loadTopicAndStats = async () => {
    try {
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*, auto_simplify_enabled, automation_quality_threshold, branding_config, donation_enabled, donation_config, community_config, community_pulse_frequency, illustration_style, illustration_primary_color, drip_feed_enabled, rss_enabled, email_subscriptions_enabled, landmark_setup_state, coverage_setup_state')
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

      setTopic(({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicData.keywords || [],
        landmarks: topicData.landmarks || [],
        landmark_descriptions: (topicData.landmark_descriptions as Record<string, string>) || {},
        landmark_reference_images:
          ((topicData as any).landmark_reference_images as Record<string, { url: string; credit?: string | undefined }[]>) || {},
        landmark_setup_state: ((topicData as any).landmark_setup_state as Record<string, any>) || {},
        coverage_setup_state: ((topicData as any).coverage_setup_state as Record<string, any>) || {},
        mcp_enabled: ((topicData as any).mcp_enabled as boolean) || false,
        mcp_access: (((topicData as any).mcp_access as 'open' | 'key') || 'key'),
        postcodes: topicData.postcodes || [],
        organizations: topicData.organizations || [],
        negative_keywords: topicData.negative_keywords || [],
        competing_regions: topicData.competing_regions || [],
        default_writing_style: (topicData.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven') || 'journalistic',
        illustration_style: (topicData.illustration_style as IllustrationStyle) || ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE,
        community_config: topicData.community_config as any || { subreddits: [], processing_frequency_hours: 24 }
      }) as unknown as Topic | null);

      setNegativeKeywords(topicData.negative_keywords || []);
      setCompetingRegions(topicData.competing_regions || []);
      // Show the dashboard as soon as the feed itself is known; counts fill in after.
      setLoading(false);

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

      const { count: eventSourcesCount } = await supabase
        .from('event_sources')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicData.id);

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
      
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11] = await Promise.all([
        supabase
        .from('stories')
        .select('id, topic_articles!inner(topic_id)', { count: 'exact' })
        .eq('topic_articles.topic_id', topicData.id)
        .gte('created_at', yesterday.toISOString())
        .not('topic_article_id', 'is', null),
        supabase
        .from('sentiment_cards')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicData.id),
        supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('notification_type', 'daily')
        .eq('is_active', true)
        .not('email', 'is', null),
        supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('notification_type', 'weekly')
        .eq('is_active', true)
        .not('email', 'is', null),
        supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null),
        supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null)
        .gte('created_at', today.toISOString()),
        supabase
        .from('topic_newsletter_signups')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('is_active', true)
        .not('email', 'is', null)
        .gte('created_at', weekAgo.toISOString()),
        supabase
        .from('story_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'donation_button_clicked'),
        supabase
        .from('story_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'donation_modal_opened'),
        supabase
        .from('story_swipes')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id)
        .eq('swipe_type', 'like'),
        supabase
        .from('story_swipes')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicData.id),
        supabase
        .from('story_interactions')
        .select('story_id')
        .eq('topic_id', topicData.id)
        .eq('interaction_type', 'share_click'),
      ]);
      const simplifiedRes = r0;
      const sentimentRes = r1;
      const { count: dailySubscribers } = r2;
      const { count: weeklySubscribers } = r3;
      const { count: totalEmailSubscribers } = r4;
      const { count: signupsToday } = r5;
      const { count: signupsWeek } = r6;
      const { count: donationButtonClicks } = r7;
      const { count: donationModalOpens } = r8;
      const { count: likedStories } = r9;
      const { count: totalSwipes } = r10;
      const { data: sharedStories } = r11;

      const uniqueSharedStories = new Set(sharedStories?.map(s => s.story_id) || []).size;

      setStats({
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesCount || 0,
        event_sources: eventSourcesCount || 0,
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
      setStatsLoaded(true);

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
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [setupActive, setSetupActive] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    if (!topic?.id || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKeyFor(topic.id));
      setSetupDismissed(raw ? !!JSON.parse(raw).done : false);
    } catch {
      setSetupDismissed(false);
    }
    setSetupChecked(true);
  }, [topic?.id]);

  // Latch the guide open once a feed is detected as empty, so adding a source
  // mid-flow doesn't make it vanish.
  useEffect(() => {
    if (!topic?.id || !setupChecked || !statsLoaded || setupDismissed) return;
    const empty =
      (stats.sources || 0) === 0 && (stats.articles || 0) === 0 && (stats.stories || 0) === 0;
    if (empty) {
      setSetupActive(true);
    } else if (!setupActive) {
      // Feed already has content — setup is done for good.
      try {
        window.localStorage.setItem(storageKeyFor(topic.id), JSON.stringify({ done: true }));
      } catch {
        /* ignore */
      }
      setSetupDismissed(true);
    }
  }, [topic?.id, setupChecked, statsLoaded, setupDismissed, setupActive, stats.sources, stats.articles, stats.stories]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  const [forceRescrape, setForceRescrape] = useState(true);

  useEffect(() => {
    if (!topic?.id || typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(`topic-scraping-settings:${topic.id}`);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { maxAgeDays?: number | undefined; forceRescrape?: boolean | undefined };
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

  // Going live is one tap; going offline is confirmed inside LiveFeedControl. No toast on success.
  const handlePublishToggle = async (newState: boolean) => {
    if (!topic) return;
    try {
      const { data, error } = await supabase.rpc('set_topic_distribution' as any, {
        p_topic_id: topic.id,
        p_field: 'is_public',
        p_enabled: newState,
      });
      if (error) throw error;
      if ((data as any)?.error === 'pro_required') {
        setProGateOpen(true);
        return;
      }
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Not saved');
      setTopic(prev => prev ? { ...prev, is_public: newState, is_active: newState } : null);
    } catch (error) {
      console.error('Error updating publish status:', error);
      toast({ title: newState ? "Couldn't make the feed live" : "Couldn't take the feed offline", variant: "destructive" });
    }
  };

  // Inline toggle helper for distribution channels
  const handleChannelToggle = async (field: string, checked: boolean, label: string) => {
    const distributionFields = new Set(['is_public', 'email_subscriptions_enabled', 'rss_enabled', 'public_widget_builder_enabled', 'mcp_enabled', 'audio_briefings_daily_enabled', 'audio_briefings_weekly_enabled']);
    const response = distributionFields.has(field)
      ? await supabase.rpc('set_topic_distribution' as any, { p_topic_id: topic!.id, p_field: field, p_enabled: checked })
      : await supabase.from('topics').update({ [field]: checked } as any).eq('id', topic!.id);
    const result = response.data as any;
    if (result?.error === 'pro_required') {
      setProGateOpen(true);
      return;
    }
    if (!response.error && (result?.success !== false)) {
      setTopic((current) => current
        ? { ...current, [field]: checked, ...(field === 'is_public' ? { is_active: checked } : {}) }
        : current);
    } else {
      toast({ title: 'Not saved', description: `${label} could not be updated.`, variant: 'destructive' });
    }
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8 flex items-center justify-center h-64">
          <div className="w-full space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full rounded-xl" /></div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8 text-center space-y-4">
          <h1 className="font-display text-[32px] leading-tight font-normal">Feed not found</h1>
          <p className="text-muted-foreground">This feed doesn't exist or you don't have access.</p>
          <Button asChild><Link to="/dashboard">Back to your feeds</Link></Button>
        </div>
      </div>
    );
  }

  const isOwner = topic.created_by === user.id;
  const isNewFeed = isOwner && setupActive;
  const setupIncomplete = isOwner && (stats.sources || 0) === 0;

  return (
    <AppLayout>
      <TopicPulseProvider topicId={topic.id}>
      <DeskLookTracker active={activeTab === "feed"} />
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-6">

          {/* Header — feed name left; reading now + live status right */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className="font-display text-[32px] leading-tight font-normal">{topic.name}</h1>
            <div className="flex items-center gap-3">
              <ReadingNow />
              <LiveFeedControl
                isLive={topic.is_public}
                feedName={topic.name}
                feedPath={`/feed/${topic.slug}`}
                onChange={handlePublishToggle}
              />
            </div>
          </div>

          {isNewFeed && !setupDismissed && (
            <FeedSetupGuide
              topic={topic as any}
              sourceCount={(stats.sources || 0) + (stats.event_sources || 0)}
              negativeKeywords={negativeKeywords}
              competingRegions={competingRegions}
              onNegativeKeywordsChange={setNegativeKeywords}
              onCompetingRegionsChange={setCompetingRegions}
              onTopicChange={(updatedTopic) => setTopic((prev) => ({ ...prev!, ...updatedTopic }))}
              onUpdate={loadTopicAndStats}
              onGather={handleStartScraping}
              gathering={gatheringAll}
              onSkip={() => {
                try {
                  window.localStorage.setItem(storageKeyFor(topic.id), JSON.stringify({ done: true }));
                } catch {
                  /* ignore */
                }
                setSetupDismissed(true);
              }}
            />
          )}

          {setupDismissed && setupIncomplete && (
            <div className="mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    window.localStorage.setItem(storageKeyFor(topic.id), JSON.stringify({ step: 1 }));
                  } catch {
                    /* ignore */
                  }
                  setSetupDismissed(false);
                }}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Finish setup
              </Button>
            </div>
          )}

          {/* Tabs: Desk (default), Sources, Readers, Settings */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value);
              if (value === 'settings' && slug) { navigate(settingsPath(slug, 'general')); return; }
              if (settingsSection && slug) { navigate(`/dashboard/topic/${slug}?tab=${value}`); return; }
              const nextParams = new URLSearchParams(searchParams);
              nextParams.set('tab', value);
              if (value !== 'settings') nextParams.delete('section');
              setSearchParams(nextParams, { replace: true });
            }}
            className={`space-y-6 ${isNewFeed && !setupDismissed ? "hidden" : ""}`}
          >
            <TabsList className="w-full bg-transparent border-b border-border rounded-none h-9 p-0 gap-4 justify-start">
              <TabsTrigger value="feed" className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-bright data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground">
                Desk
              </TabsTrigger>
              <TabsTrigger value="sources" className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-bright data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground">
                Sources
              </TabsTrigger>
              <TabsTrigger value="stats" className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-bright data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground">
                Readers
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-bright data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground">
                Settings
              </TabsTrigger>
            </TabsList>

            {/* ===== STATS TAB ===== */}
            <TabsContent value="stats" className="space-y-8">
              <ReadershipPanel topicId={topic.id} topicSlug={topic.slug} />
            </TabsContent>


            {/* ===== FEED TAB ===== */}
            <TabsContent value="feed" className="space-y-6">
              <MilestoneNote />
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
              
              <div className="mb-6" id="assistant-add-story">
                <AddStoryDialog
                  topicId={topic.id}
                  onContentProcessed={loadTopicAndStats}
                />
              </div>

              <UnifiedContentPipeline selectedTopicId={topic.id} />

            </TabsContent>

            {/* ===== SOURCES TAB ===== */}
            <TabsContent value="sources" className="space-y-6">
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
            </TabsContent>

            {/* ===== EDITORIAL CONTROL CENTRE ===== */}
            <TabsContent value="settings" className="mt-0 pt-2">
              <EditorialControlCenter
                section={settingsSection}
                topic={topic}
                stats={stats}
                negativeKeywords={negativeKeywords}
                onNegativeKeywordsChange={setNegativeKeywords}
                onTopicChange={(updatedTopic) => setTopic((current) => current ? ({ ...current, ...updatedTopic } as Topic) : current)}
                onUpdate={loadTopicAndStats}
                onChannelToggle={handleChannelToggle}
                onToast={(title, description) => toast({ title, description })}
                onProRequired={() => setProGateOpen(true)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {isOwner && (
          <OwnerAssistant topicId={topic.id} topicSlug={topic.slug} topicName={topic.name} />
        )}
        <ProGateDialog open={proGateOpen} onOpenChange={setProGateOpen} returnTo={`/dashboard/topic/${topic.slug}`} />
      </div>
      </TopicPulseProvider>
    </AppLayout>
  );
};

export default TopicDashboard;
