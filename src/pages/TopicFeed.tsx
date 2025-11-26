import { useParams } from "react-router-dom";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { format } from "date-fns";
import StoryCarousel from "@/components/StoryCarousel";
import { EndOfFeedCTA } from "@/components/EndOfFeedCTA";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentimentCards } from "@/hooks/useSentimentCards";
import { useHybridTopicFeedWithKeywords } from "@/hooks/useHybridTopicFeedWithKeywords";
import { SentimentCard } from "@/components/SentimentCard";
import { EventsAccordion } from "@/components/EventsAccordion";
import { FilterModal } from "@/components/FilterModal";
import { DonationButton } from "@/components/DonationButton";
import { DonationModal } from "@/components/DonationModal";
import { Hash, MapPin, Filter, Bell, Archive, Calendar, CalendarDays, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { TopicFeedSEO } from "@/components/seo/TopicFeedSEO";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useStoryNotifications } from "@/hooks/useStoryNotifications";
import { AddToHomeScreen } from "@/components/AddToHomeScreen";
import { NewsletterSignupModal } from "@/components/NewsletterSignupModal";
import { NotificationPreferencesModal } from "@/components/NotificationPreferencesModal";
import { CommunityPulseSlides } from "@/components/CommunityPulseSlides";
import { useCommunityPulseKeywords } from "@/hooks/useCommunityPulseKeywords";
import { useStoryViewTracker } from "@/hooks/useStoryViewTracker";
import { Link } from "react-router-dom";
import { useTopicFavicon } from "@/hooks/useTopicFavicon";
import { useAutomatedInsightCards, trackInsightCardDisplay } from "@/hooks/useAutomatedInsightCards";
import { AutomatedInsightCard } from "@/components/AutomatedInsightCard";

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [latestDaily, setLatestDaily] = useState<string | null>(null);
  const [latestWeekly, setLatestWeekly] = useState<string | null>(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [storiesWithSwipes, setStoriesWithSwipes] = useState<Set<string>>(new Set());
  const [hasCheckedNotificationStatus, setHasCheckedNotificationStatus] = useState(false);
  const [shouldShowNotificationPrompt, setShouldShowNotificationPrompt] = useState(false);
  const [scrollPastStoriesWithSwipes, setScrollPastStoriesWithSwipes] = useState(false);
  const [showCollectionsHint, setShowCollectionsHint] = useState(false);
  const [storiesScrolledPast, setStoriesScrolledPast] = useState(0);
  const [avgDailyStories, setAvgDailyStories] = useState<number>(0);
  
  // Track story views for PWA prompt trigger
  const { incrementStoriesViewed } = useStoryViewTracker(slug || '');


  const {
    stories: filteredStories,
    content: filteredContent,
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    selectedKeywords,
    availableKeywords,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters,
    isServerFiltering,
    selectedLandmarks,
    availableLandmarks,
    toggleLandmark,
    removeLandmark,
    selectedOrganizations,
    availableOrganizations,
    toggleOrganization,
    removeOrganization,
    selectedSources,
    availableSources,
    toggleSource,
    removeSource,
    isLive,
    hasNewStories,
    newStoryCount,
    refreshFromNewStories,
    ensureFilterStoryIndexLoaded
  } = useHybridTopicFeedWithKeywords(slug || '');

  useEffect(() => {
    if (isModalOpen) {
      ensureFilterStoryIndexLoaded();
    }
  }, [isModalOpen, ensureFilterStoryIndexLoaded]);

  // Debug helper for resetting collections hint
  useEffect(() => {
    (window as any).resetCollectionsHint = () => {
      if (slug) {
        localStorage.removeItem(`collections_hint_shown_${slug}`);
        setShowCollectionsHint(true);
        console.log('Collections hint reset - scroll to trigger it again');
      }
    };
  }, [slug]);

  // Track visitor for analytics
  const visitorId = useVisitorTracking(topic?.id);

  // Calculate average daily stories for the topic
  useEffect(() => {
    if (!topic?.id) return;

    const calculateAvgDailyStories = async () => {
      // Get first published story date for this topic (legacy system)
      const { data: legacyFirstStory } = await supabase
        .from('stories')
        .select('created_at, articles!inner(topic_id)')
        .eq('articles.topic_id', topic.id)
        .in('status', ['ready', 'published'])
        .order('created_at', { ascending: true })
        .limit(1);

      // Get first published story date for this topic (multi-tenant system)
      const { data: mtFirstStory } = await supabase
        .from('stories')
        .select('created_at, topic_articles!inner(topic_id)')
        .eq('topic_articles.topic_id', topic.id)
        .in('status', ['ready', 'published'])
        .not('topic_article_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1);

      // Find the earliest story date
      const dates = [
        ...(legacyFirstStory || []),
        ...(mtFirstStory || [])
      ].map(s => new Date(s.created_at).getTime());

      if (dates.length === 0) return;

      const firstStoryDate = new Date(Math.min(...dates));
      const now = new Date();
      const daysActive = Math.max(1, Math.ceil((now.getTime() - firstStoryDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Get total published stories count (legacy)
      const { count: legacyCount } = await supabase
        .from('stories')
        .select('id, articles!inner(topic_id)', { count: 'exact', head: true })
        .eq('articles.topic_id', topic.id)
        .in('status', ['ready', 'published']);

      // Get total published stories count (multi-tenant)
      const { count: mtCount } = await supabase
        .from('stories')
        .select('id, topic_articles!inner(topic_id)', { count: 'exact', head: true })
        .eq('topic_articles.topic_id', topic.id)
        .in('status', ['ready', 'published'])
        .not('topic_article_id', 'is', null);

      const totalCount = (legacyCount || 0) + (mtCount || 0);
      if (totalCount > 0) {
        setAvgDailyStories(totalCount / daysActive);
      }
    };

    calculateAvgDailyStories();
  }, [topic?.id]);

  // Check if user already has notifications enabled for this topic
  useEffect(() => {
    if (!topic?.id || hasCheckedNotificationStatus) return;
    
    const checkNotificationStatus = async () => {
      // Check localStorage first to see if they've been prompted this session
      const promptKey = `notification_prompt_shown_${topic.id}`;
      const hasBeenPrompted = localStorage.getItem(promptKey);
      
      if (hasBeenPrompted) {
        setHasCheckedNotificationStatus(true);
        return;
      }

      // Check if they have any active subscriptions
      const { data: subscriptions } = await supabase
        .from('topic_newsletter_signups')
        .select('id')
        .eq('topic_id', topic.id)
        .eq('is_active', true)
        .limit(1);

      // If no subscriptions, mark them as eligible for prompt
      if (!subscriptions || subscriptions.length === 0) {
        setShouldShowNotificationPrompt(true);
      }
      
      setHasCheckedNotificationStatus(true);
    };

    checkNotificationStatus();
  }, [topic?.id, hasCheckedNotificationStatus]);

  // Track story swipes - only count stories where user has swiped at least once
  const handleStorySwipe = useCallback((storyId: string) => {
    if (!shouldShowNotificationPrompt || !topic?.id) return;

    setStoriesWithSwipes(prev => {
      const newSet = new Set(prev);
      newSet.add(storyId);
      return newSet;
    });
  }, [shouldShowNotificationPrompt, topic?.id]);

  // Track when user scrolls past stories they've engaged with
  const handleStoryScrolledPast = useCallback(() => {
    setStoriesScrolledPast(prev => prev + 1);
    
    // Show collections hint after scrolling past 2nd story
    if (storiesScrolledPast === 1 && !showCollectionsHint && slug) {
      const hintKey = `collections_hint_shown_${slug}`;
      const hasBeenShown = localStorage.getItem(hintKey);
      
      if (!hasBeenShown) {
        setShowCollectionsHint(true);
        localStorage.setItem(hintKey, 'true');
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setShowCollectionsHint(false);
        }, 5000);
      }
    }
    
    if (!shouldShowNotificationPrompt || !topic?.id) return;
    if (storiesWithSwipes.size < 2) return;
    
    // User has swiped on 2+ stories and is now scrolling past them
    if (!scrollPastStoriesWithSwipes) {
      setScrollPastStoriesWithSwipes(true);
      setShowNotificationModal(true);
      // Mark as prompted so we don't show again this session
      localStorage.setItem(`notification_prompt_shown_${topic.id}`, 'true');
      setShouldShowNotificationPrompt(false);
    }
  }, [storiesWithSwipes, shouldShowNotificationPrompt, scrollPastStoriesWithSwipes, topic?.id, storiesScrolledPast, showCollectionsHint, slug]);

  // Update favicon based on topic branding
  const branding = topic?.branding_config as any;
  const faviconUrl = branding?.icon_url || branding?.logo_url;
  useTopicFavicon(faviconUrl);

  // Update manifest dynamically based on topic
  useEffect(() => {
    if (!slug) return;

    try {
      let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/topic-manifest?slug=${slug}`;
    } catch (error) {
      console.error('Failed to update manifest:', error);
    }

    // Cleanup - restore default on unmount
    return () => {
      try {
        const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (manifestLink) manifestLink.href = '/manifest.json';
      } catch (error) {
        console.error('Failed to restore manifest:', error);
      }
    };
  }, [slug]);

  // Fetch monthly count and latest roundups after we have topic
  useEffect(() => {
    let active = true;
    const fetchMonthlyCount = async () => {
      if (!topic?.id || !slug) return;
      
      try {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        
        // Use correct RPC parameters
        const { data, error } = await supabase.rpc('get_topic_stories_with_keywords', {
          p_topic_slug: slug,
          p_keywords: null,
          p_sources: null,
          p_limit: 500,
          p_offset: 0
        });
        
        if (error) {
          console.error('Monthly count error:', error);
          return;
        }
        
        // Count unique stories published this month (no longer displayed but keeping for future use)
        const storyMap = new Map<string, any>();
        (data || []).forEach((row: any) => {
          if (!storyMap.has(row.story_id)) {
            storyMap.set(row.story_id, row);
          }
        });

        // Fetch latest daily roundup
        const { data: dailyRoundup } = await supabase
          .from('topic_roundups')
          .select('period_start')
          .eq('topic_id', topic.id)
          .eq('roundup_type', 'daily')
          .eq('is_published', true)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dailyRoundup && active) {
          setLatestDaily(format(new Date(dailyRoundup.period_start), 'yyyy-MM-dd'));
        }

        // Fetch latest weekly roundup
        const { data: weeklyRoundup } = await supabase
          .from('topic_roundups')
          .select('period_start')
          .eq('topic_id', topic.id)
          .eq('roundup_type', 'weekly')
          .eq('is_published', true)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (weeklyRoundup && active) {
          setLatestWeekly(format(new Date(weeklyRoundup.period_start), 'yyyy-MM-dd'));
        }
      } catch (e) {
        console.warn('Monthly count fetch failed:', e);
      }
    };
    
    fetchMonthlyCount();
    return () => { active = false };
  }, [topic?.id, slug]);

  const { sentimentCards } = useSentimentCards(topic?.id);
  const { data: pulseData } = useCommunityPulseKeywords(topic?.id || '');
  const { data: insightCards = [] } = useAutomatedInsightCards(topic?.id, topic?.automated_insights_enabled ?? true);

  // Show community pulse slides only if topic has community intelligence enabled and has keywords
  const shouldShowCommunityPulse = topic?.community_intelligence_enabled && pulseData && pulseData.keywords.length > 0;

  const lastStoryContentIndex = useMemo(() => {
    let lastIndex = -1;
    filteredContent.forEach((item, index) => {
      if (item.type === 'story') {
        lastIndex = index;
      }
    });
    return lastIndex;
  }, [filteredContent]);

  // Track visitor stats
  useVisitorTracking(topic?.id);

  // Enable browser notifications for new stories
  useStoryNotifications(topic?.id, topic?.name || '', slug);

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection Observer for infinite scroll with iOS-specific optimization
  const lastStoryElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    // iOS-specific: More aggressive rootMargin for better perceived performance
    const rootMargin = isIOS ? '400px' : '100px';
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    }, {
      threshold: 0.1,
      rootMargin
    });
    
    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, loadMore, isIOS]);
  
  // iOS-specific: Add passive scroll listener for feed container
  useEffect(() => {
    if (!isIOS) return;
    
    const feedContainer = document.querySelector('[data-feed-container]');
    if (!feedContainer) return;
    
    const handleScroll = () => {
      requestAnimationFrame(() => {
        // iOS optimization: Debounce expensive operations during scroll
      });
    };
    
    feedContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => feedContainer.removeEventListener('scroll', handleScroll);
  }, [isIOS]);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          {/* Loading skeleton for header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-64 h-10" />
            </div>
          </div>
          
          {/* Loading skeleton for filters */}
          <div className="mb-8">
            <Skeleton className="w-full h-12" />
          </div>
          
          {/* Loading skeleton for stories */}
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="w-full h-96 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Topic Not Found</h1>
            <p className="text-muted-foreground">
              The topic you're looking for doesn't exist, has been deactivated, or is not publicly available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen feed-background">
      {/* SEO Meta Tags */}
      <TopicFeedSEO
        topicName={topic.name}
        topicDescription={topic.branding_config?.subheader || topic.description}
        topicSlug={slug || ''}
        topicType={topic.topic_type}
        region={topic.region}
        logoUrl={topic.branding_config?.logo_url}
      />

      {/* Add to Home Screen Prompt */}
      <AddToHomeScreen
        topicName={topic.name}
        topicSlug={slug || ''}
        topicIcon={topic.branding_config?.icon_url || topic.branding_config?.logo_url}
      />

      {/* Sticky header for scrollers */}
      {isScrolled && topic && (
        <div className="fixed top-0 left-0 right-0 z-50 feed-header backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {topic.branding_config?.logo_url ? (
                  <img
                    src={`${topic.branding_config.logo_url}?t=${Date.now()}`}
                    alt={`${topic.name} logo`}
                    className="h-[34px] w-auto object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {topic.topic_type === 'regional' ? (
                      <MapPin className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Hash className="w-4 h-4 text-green-500" />
                    )}
                    <span className="font-semibold text-lg">{topic.name}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNotificationModal(true)}
                  className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  aria-label="Manage notifications"
                >
                  <Bell className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">Notify Me</span>
                  {shouldShowNotificationPrompt && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-background"></span>
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">Filters</span>
                  {hasActiveFilters && (
                    <span className="w-2 h-2 bg-primary rounded-full" />
                  )}
                </button>

                {/* Collection Icons - Daily and Weekly only */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to={`/feed/${slug}/daily/${latestDaily || 'latest'}`}>
                        <button
                          className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Today's briefing"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Daily Briefing</p>
                      <p className="text-xs text-muted-foreground">Today's top stories</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to={`/feed/${slug}/weekly/${latestWeekly || 'latest'}`}>
                        <button
                          className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="This week's briefing"
                        >
                          <CalendarDays className="w-4 h-4" />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Weekly Briefing</p>
                      <p className="text-xs text-muted-foreground">This week's highlights</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Donation Button - Icon Only */}
              {topic.donation_enabled && topic.donation_config?.tiers?.length > 0 && (
                <DonationButton
                  onClick={() => setShowDonationModal(true)}
                  buttonText={topic.donation_config.button_text || "Support"}
                  topicId={topic.id}
                  visitorId={visitorId}
                  iconOnly
                />
              )}

            </div>
          </div>
        </div>
      )}

      {/* Instagram-style "New Stories Available" button */}
      {hasNewStories && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top duration-300">
          <Button
            onClick={refreshFromNewStories}
            className="bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center gap-2 px-4 py-2 rounded-full"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="font-medium">
              {newStoryCount > 1 ? `${newStoryCount} new stories available` : 'New story available'}
            </span>
          </Button>
        </div>
      )}

      {/* White banner header */}
      <div className="bg-background border-b border-border">
        <div className="container mx-auto px-1 md:px-4 py-16">
          {/* Top left: Avatar (if logged in) and Live pill (if active) */}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            {user && (
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            )}
            {isLive && avgDailyStories > 1 ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live • {Math.round(avgDailyStories)}/day
              </span>
            ) : isLive ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </span>
            ) : null}
          </div>

          {/* Topic Header - Clean and minimal with branding support */}
          <div className="text-center space-y-4">
            <div className="relative flex items-center justify-center mb-6">
              {/* Centered logo or title */}
              {topic.branding_config?.logo_url ? (
                <div className="flex justify-center w-full animate-fade-in">
                  <div className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl flex justify-center">
                    <img
                      src={`${topic.branding_config.logo_url}?t=${Date.now()}`}
                      alt={`${topic.name} logo`}
                      className="h-[68px] sm:h-[103px] object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {topic.topic_type === 'regional' ? (
                    <MapPin className="w-6 h-6 text-blue-500" />
                  ) : (
                    <Hash className="w-6 h-6 text-green-500" />
                  )}
                  <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {topic.name}
                  </h1>
                </div>
              )}
              
              {/* Beta pill top right - only show if no branding logo */}
              {!topic.branding_config?.logo_url && (
                <div className="absolute right-0 top-0">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    beta
                  </span>
                </div>
              )}
            </div>

            {topic.branding_config?.subheader ? (
              <p className="text-muted-foreground max-w-2xl mx-auto text-center px-1 md:px-4 mb-6">
                {topic.branding_config.subheader}
              </p>
            ) : topic.description ? (
              <p className="text-muted-foreground max-w-2xl mx-auto text-center px-1 md:px-4 mb-6">
                {topic.description}
              </p>
            ) : null}

            {/* Filter button - below subheader, centered */}
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                aria-label="Open filters"
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">Filters</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-primary rounded-full" />
                )}
              </button>

              <TooltipProvider>
                <Tooltip open={showCollectionsHint}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <Link to={`/feed/${slug}/daily/${latestDaily || 'latest'}`}>
                        <button
                          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Today's briefing"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      </Link>

                      <Link to={`/feed/${slug}/weekly/${latestWeekly || 'latest'}`}>
                        <button
                          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="This week's briefing"
                        >
                          <CalendarDays className="w-4 h-4" />
                        </button>
                      </Link>

                      <Link to={`/feed/${slug}/archive`}>
                        <button
                          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="View archive"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </Link>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="z-[60]">
                    <p className="font-medium">Daily & Weekly Briefings</p>
                    <p className="text-xs text-muted-foreground mt-1">Quick summaries of top stories</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>

      <div className={`container mx-auto px-1 md:px-4 py-8 ${isScrolled ? 'pt-16' : ''}`}>

        {/* Mobile-only selected filters display */}
        {(selectedKeywords.length > 0 || selectedSources.length > 0) && (
          <div className="mb-6 sm:hidden">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground mb-2 w-full text-center">Filtering by:</span>
              {selectedKeywords.map((keyword) => (
                <Badge
                  key={`keyword-${keyword}`}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{keyword}</span>
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedSources.map((source) => (
                <Badge
                  key={`source-${source}`}
                  variant="outline"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{source.split('.')[0]}</span>
                  <button
                    onClick={() => removeSource(source)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Filter Modal */}
        <FilterModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          availableKeywords={availableKeywords}
          selectedKeywords={selectedKeywords}
          onKeywordToggle={toggleKeyword}
          availableLandmarks={availableLandmarks}
          selectedLandmarks={selectedLandmarks}
          onLandmarkToggle={toggleLandmark}
          availableOrganizations={availableOrganizations}
          selectedOrganizations={selectedOrganizations}
          onOrganizationToggle={toggleOrganization}
          availableSources={availableSources}
          selectedSources={selectedSources}
          onSourceToggle={toggleSource}
          onClearAll={clearAllFilters}
        />

        {/* Donation Modal */}
        {topic && topic.donation_enabled && (
          <DonationModal
            isOpen={showDonationModal}
            onClose={() => setShowDonationModal(false)}
            topicName={topic.name}
            topicId={topic.id}
            buttonText={topic.donation_config?.button_text || "Support this feed"}
            tiers={topic.donation_config?.tiers || []}
            visitorId={`visitor_${Date.now()}`}
          />
        )}

        {/* Content with infinite scroll - chronologically ordered stories and parliamentary mentions */}
        {!loading && filteredContent.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            {hasActiveFilters ? (
              <>
                <p className="text-lg text-muted-foreground">No stories match your selected filters</p>
                <p className="text-sm text-muted-foreground">Try adjusting your keyword or source selections</p>
              </>
            ) : (
              <>
                <p className="text-lg text-muted-foreground">No stories available yet</p>
                <p className="text-sm text-muted-foreground">Check back soon for new content</p>
              </>
            )}
          </div>
        ) : filteredContent.length > 0 ? (
          <div className="space-y-6 md:space-y-8 flex flex-col items-center">
            {(() => {
              // Defensive duplicate detection with console warning
              const seenIds = new Set<string>();
              const duplicates: string[] = [];
              
              filteredContent.forEach(item => {
                if (item?.id) {
                  if (seenIds.has(item.id)) {
                    duplicates.push(item.id.substring(0, 8));
                  } else {
                    seenIds.add(item.id);
                  }
                }
              });
              
              if (duplicates.length > 0) {
                console.warn(`⚠️ DUPLICATE CONTENT IDs IN FEED: ${duplicates.join(', ')}...`);
              }
              
              return filteredContent;
            })().map((contentItem, index) => {
              const items = [];
              
              if (contentItem.type === 'story') {
                const story = contentItem.data as any;
                // Generate universal story URL
                const storyShareUrl = `${window.location.origin}/feed/${slug}/story/${story.id}`;
                
                items.push(
                  <div
                    key={`story-${story.id}`}
                    ref={(node) => {
                      if (index === lastStoryContentIndex) {
                        lastStoryElementRef(node);
                      }
                      // Track story view when it enters viewport
                      if (node && 'IntersectionObserver' in window) {
                        const observer = new IntersectionObserver(
                          (entries) => {
                            entries.forEach((entry) => {
                              if (entry.isIntersecting) {
                                incrementStoriesViewed();
                                observer.disconnect();
                              }
                            });
                          },
                          { threshold: 0.5 }
                        );
                        observer.observe(node);
                      }
                    }}
                  >
                    <StoryCarousel 
                      story={story} 
                      storyUrl={storyShareUrl}
                      topicId={topic?.id}
                      storyIndex={index}
                      topicName={topic?.name}
                      topicSlug={slug}
                      onStorySwipe={handleStorySwipe}
                      onStoryScrolledPast={handleStoryScrolledPast}
                    />
                  </div>
                );
              }

              // Render parliamentary mention as a story carousel
              if (contentItem.type === 'parliamentary_mention') {
                const mention = contentItem.data as any;
                
                // Transform parliamentary mention into a Story-compatible object
                const parliamentaryStory = {
                  id: mention.id,
                  title: mention.vote_title || mention.debate_title || 'Parliamentary Activity',
                  author: mention.mp_name || 'Unknown MP',
                  publication_name: 'UK Parliament',
                  created_at: mention.created_at,
                  updated_at: mention.created_at,
                  is_parliamentary: true,
                  mp_name: mention.mp_name,
                  mp_party: mention.party,
                  constituency: mention.constituency,
                  slides: [
                    {
                      id: `${mention.id}-slide-1`,
                      slide_number: 1,
                      content: `${mention.mp_name || 'MP'}\n${format(new Date(mention.vote_date || mention.debate_date || mention.created_at), 'MMMM d, yyyy')}\n${mention.vote_title || mention.debate_title || 'Parliamentary Activity'}`,
                      word_count: 15
                    },
                    {
                      id: `${mention.id}-slide-2`,
                      slide_number: 2,
                      content: `${mention.vote_direction?.toUpperCase() || 'ABSTAIN'}${mention.is_rebellion ? '\n🔥 Against party whip' : ''}`,
                      word_count: 5
                    },
                    {
                      id: `${mention.id}-slide-3`,
                      slide_number: 3,
                      content: `${mention.vote_outcome?.toUpperCase() || 'PENDING'}\nAyes ${mention.aye_count || 0} : Noes ${mention.no_count || 0}`,
                      word_count: 10
                    },
                    {
                      id: `${mention.id}-slide-4`,
                      slide_number: 4,
                      content: `Category: ${mention.vote_category || 'General'}\n\n${mention.local_impact_summary || 'Parliamentary activity'}`,
                      word_count: 20
                    },
                    {
                      id: `${mention.id}-slide-5`,
                      slide_number: 5,
                      content: 'View full details on Parliament.uk',
                      word_count: 5,
                      links: mention.vote_url || mention.debate_url ? [{
                        url: mention.vote_url || mention.debate_url,
                        text: 'View vote details',
                        start: 0,
                        end: 16
                      }] : []
                    }
                  ],
                  article: {
                    source_url: mention.vote_url || mention.debate_url || 'https://www.parliament.uk',
                    published_at: mention.vote_date || mention.debate_date || mention.created_at,
                    region: topic?.region || 'UK'
                  }
                };

                items.push(
                  <div
                    key={`parliamentary-${mention.id}`}
                    ref={index === lastStoryContentIndex ? lastStoryElementRef : null}
                  >
                    <StoryCarousel 
                      story={parliamentaryStory} 
                      storyUrl={`${window.location.origin}/feed/${slug}/parliamentary/${mention.id}`}
                      topicId={topic?.id}
                      storyIndex={index}
                      topicName={topic?.name}
                      topicSlug={slug}
                      onStorySwipe={handleStorySwipe}
                      onStoryScrolledPast={handleStoryScrolledPast}
                    />
                  </div>
                );
              }

              // Add community pulse card based on topic setting
              const storyIndex = filteredContent.slice(0, index + 1).filter(item => item.type === 'story').length;
              const pulseFrequency = topic?.community_pulse_frequency || 8;
              if ((storyIndex - 2) % pulseFrequency === 0 && storyIndex > 2 && shouldShowCommunityPulse && topic && pulseData) {
                items.push(
                  <div key={`community-pulse-${index}`} className="w-full flex justify-center">
                    <CommunityPulseSlides
                      keywords={pulseData.keywords}
                      timeframe="48h"
                      mostActiveThreadUrl={pulseData.mostActiveThread?.url}
                      mostActiveThreadTitle={pulseData.mostActiveThread?.title}
                    />
                  </div>
                );
              }

              // Add sentiment cards with comparison cards after every 3 keyword cards
              if (storyIndex % 6 === 0 && storyIndex > 0 && sentimentCards.length > 0) {
                // Separate comparison and keyword cards
                const keywordCards = sentimentCards.filter(card => card.card_type !== 'comparison');
                const comparisonCards = sentimentCards.filter(card => card.card_type === 'comparison');
                
                // Calculate how many sentiment cards have been shown so far
                const totalSentimentCardsShown = Math.floor((storyIndex - 1) / 6);
                
                // Every 4th sentiment card slot should be a comparison card (after 3 keyword cards)
                const shouldShowComparison = (totalSentimentCardsShown + 1) % 4 === 0 && comparisonCards.length > 0;
                
                let sentimentCard;
                if (shouldShowComparison) {
                  // Cycle through comparison cards
                  const comparisonIndex = Math.floor(totalSentimentCardsShown / 4) % comparisonCards.length;
                  sentimentCard = comparisonCards[comparisonIndex];
                } else {
                  // Cycle through keyword cards (accounting for comparison card slots)
                  const keywordSlotsUsed = totalSentimentCardsShown - Math.floor(totalSentimentCardsShown / 4);
                  const keywordIndex = keywordSlotsUsed % keywordCards.length;
                  sentimentCard = keywordCards[keywordIndex];
                }
                
                if (sentimentCard) {
                  items.push(
                    <div key={`sentiment-${sentimentCard.id}-${index}`}>
                      <SentimentCard
                        id={sentimentCard.id}
                        keywordPhrase={sentimentCard.keyword_phrase}
                        content={sentimentCard.content}
                        sources={sentimentCard.sources}
                        sentimentScore={sentimentCard.sentiment_score}
                        confidenceScore={sentimentCard.confidence_score}
                        analysisDate={sentimentCard.analysis_date}
                        cardType={sentimentCard.card_type as 'quote' | 'trend' | 'comparison' | 'timeline'}
                        createdAt={sentimentCard.created_at}
                        updatedAt={sentimentCard.updated_at}
                      />
                    </div>
                  );
                }
              }

              // Add automated insight cards every 6 stories (offset by 3 to avoid collisions)
              if (storyIndex % 6 === 3 && storyIndex > 0 && insightCards.length > 0 && topic?.automated_insights_enabled) {
                const cardIndex = Math.floor((storyIndex - 3) / 6) % insightCards.length;
                const insightCard = insightCards[cardIndex];
                
                items.push(
                  <div key={`insight-${insightCard.id}-${index}`} className="w-full max-w-2xl">
                    <AutomatedInsightCard 
                      card={insightCard} 
                      topicSlug={slug}
                    />
                  </div>
                );
                
                // Track card display
                trackInsightCardDisplay(insightCard.id);
              }

              // Add events accordion every 10 stories (count stories only)
              if (storyIndex % 10 === 0 && storyIndex > 0 && topic?.id && topic?.events_enabled) {
                items.push(
                  <div key={`events-${index}`} className="w-full max-w-2xl">
                    <EventsAccordion 
                      topicId={topic.id} 
                      isOwner={false}
                    />
                  </div>
                );
              }

              return items;
            }).flat()}
            
            {/* Universal bottom sentinel for infinite scroll */}
            {hasMore && (
              <div 
                ref={(el) => {
                  if (el && lastStoryElementRef) {
                    lastStoryElementRef(el);
                    console.log('🔭 Bottom sentinel mounted, infinite scroll active');
                  }
                }} 
                className="h-px w-full" 
                aria-hidden="true" 
              />
            )}
            
            {/* Loading more indicator */}
            {(loadingMore || isServerFiltering) && (
              <div className="space-y-8">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="w-full h-96 rounded-lg" />
                ))}
                {isServerFiltering && (
                  <div className="text-center text-sm text-muted-foreground">
                    Filtering stories...
                  </div>
                )}
              </div>
            )}
            
            {/* End of feed CTA */}
            {!hasMore && !loadingMore && (
              <div className="pt-8">
                <EndOfFeedCTA 
                  topicName={topic.name} 
                  topicId={topic.id}
                  topicSlug={topic.slug}
                  topicIcon={topic.branding_config?.icon_url || topic.branding_config?.logo_url}
                />
              </div>
            )}
          </div>
        ) : hasActiveFilters ? (
          <div className="text-center py-12 space-y-4">
            <Hash className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-semibold mb-2">No stories match your filters</h3>
              <p className="text-muted-foreground mb-4">
                Try removing some keywords or adjusting your filters
              </p>
              <button
                onClick={clearAllFilters}
                className="text-primary hover:underline"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : !loading && !loadingMore ? (
          <div className="text-center py-12 space-y-4">
            <Hash className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-semibold mb-2">No stories yet</h3>
              <p className="text-muted-foreground mb-4">
                This feed doesn't have any published content yet. Check back soon for fresh stories!
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        topicName={topic?.name || ''}
        topicId={topic?.id || ''}
        isFirstTimePrompt={shouldShowNotificationPrompt}
      />
    </div>
  );
};

export default TopicFeed;