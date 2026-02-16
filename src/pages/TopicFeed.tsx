import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { format } from "date-fns";
import StoryCarousel from "@/components/StoryCarousel";
import { EndOfFeedCTA } from "@/components/EndOfFeedCTA";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentimentCards } from "@/hooks/useSentimentCards";
import { useHybridTopicFeedWithKeywords } from "@/hooks/useHybridTopicFeedWithKeywords";
import { EventsAccordion } from "@/components/EventsAccordion";
import { FilterModal } from "@/components/FilterModal";
import { DonationButton } from "@/components/DonationButton";
import { DonationModal } from "@/components/DonationModal";
import { Hash, MapPin, RefreshCw } from "lucide-react";
import { FeedHamburgerMenu } from "@/components/feed/FeedHamburgerMenu";
import { SubscribeMenu } from "@/components/feed/SubscribeMenu";
import { PlayModeMenu } from "@/components/feed/PlayModeMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { useStoryImpressionTracking } from "@/hooks/useStoryImpressionTracking";
import { TopicFeedSEO } from "@/components/seo/TopicFeedSEO";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStoryNotifications } from "@/hooks/useStoryNotifications";
import { NewsletterSignupModal } from "@/components/NewsletterSignupModal";
import { CookieConsent } from "@/components/CookieConsent";
import { NotificationPreferencesModal } from "@/components/NotificationPreferencesModal";
import { CommunityPulseSlides } from "@/components/CommunityPulseSlides";
import { useCommunityPulseKeywords } from "@/hooks/useCommunityPulseKeywords";
import { useStoryViewTracker } from "@/hooks/useStoryViewTracker";
import { Link } from "react-router-dom";
import { useTopicFavicon } from "@/hooks/useTopicFavicon";
import { useAutomatedInsightCards, trackInsightCardDisplay } from "@/hooks/useAutomatedInsightCards";
import { useQuizCards } from "@/hooks/useQuizCards";
import { useTopicMetadata } from "@/hooks/useTopicMetadata";
import { FeedOnboardingOrchestrator, InlinePWACard } from "@/components/onboarding";
import { useParliamentaryInsightCards } from "@/hooks/useParliamentaryInsightCards";
import { useParliamentaryDigestCards } from "@/hooks/useParliamentaryDigestCards";
import { InlineEmailSignupCard } from "@/components/feed/InlineEmailSignupCard";

// Optimization #7: Lazy-load interstitial card components to reduce initial bundle
const SentimentCard = React.lazy(() => import("@/components/SentimentCard").then(m => ({ default: m.SentimentCard })));
const AutomatedInsightCard = React.lazy(() => import("@/components/AutomatedInsightCard").then(m => ({ default: m.AutomatedInsightCard })));
const QuizCard = React.lazy(() => import("@/components/quiz/QuizCard").then(m => ({ default: m.QuizCard })));
const ParliamentaryInsightCard = React.lazy(() => import("@/components/ParliamentaryInsightCard").then(m => ({ default: m.ParliamentaryInsightCard })));
const ParliamentaryDigestCard = React.lazy(() => import("@/components/ParliamentaryDigestCard").then(m => ({ default: m.ParliamentaryDigestCard })));
const FlashbackInsightsPanel = React.lazy(() => import("@/components/FlashbackInsightsPanel").then(m => ({ default: m.FlashbackInsightsPanel })));
import { useStoriesReactionsBatch } from "@/hooks/useStoriesReactionsBatch";
import { MobileLoadErrorOverlay } from "@/components/MobileLoadErrorOverlay";
import { 
  FEED_CARD_POSITIONS, 
  shouldShowCard, 
  getCardIndex,
  logCollisionReport 
} from "@/lib/feedCardPositions";
import { buildShareUrl } from "@/lib/urlUtils";
import { isInAppBrowser } from "@/lib/deviceUtils";

// Helper functions using centralized position system
const shouldShowSentiment = (idx: number) => shouldShowCard('sentiment', idx);
const getSentimentIndex = (idx: number) => getCardIndex('sentiment', idx);
const shouldShowAutomatedInsight = (idx: number) => shouldShowCard('automatedInsight', idx);
const getAutomatedInsightIndex = (idx: number) => getCardIndex('automatedInsight', idx);
const shouldShowQuiz = (idx: number) => shouldShowCard('quiz', idx);
const getQuizIndex = (idx: number) => getCardIndex('quiz', idx);
const shouldShowEvents = (idx: number) => shouldShowCard('events', idx);
const shouldShowParliamentary = (idx: number) => shouldShowCard('parliamentary', idx);
const shouldShowParliamentaryDigest = (idx: number) => shouldShowCard('parliamentaryDigest', idx);
const shouldShowFlashback = (idx: number) => shouldShowCard('flashback', idx);
const shouldShowCommunityPulseCard = (idx: number) => shouldShowCard('communityPulse', idx);
const getCommunityPulseIndex = (idx: number) => getCardIndex('communityPulse', idx);
const shouldShowEmailBriefing = (idx: number) => shouldShowCard('emailBriefing', idx);

// Log position map on mount (development only)
if (import.meta.env.DEV) {
  logCollisionReport(50);
}

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Optimization #2: Shared IntersectionObserver for story view tracking
  const sharedStoryObserverRef = useRef<IntersectionObserver | null>(null);
  const storyObserverMapRef = useRef<Map<Element, string>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [storiesWithSwipes, setStoriesWithSwipes] = useState<Set<string>>(new Set());
  const [hasCheckedNotificationStatus, setHasCheckedNotificationStatus] = useState(false);
  const [shouldShowNotificationPrompt, setShouldShowNotificationPrompt] = useState(false);
  const [scrollPastStoriesWithSwipes, setScrollPastStoriesWithSwipes] = useState(false);
  // showCollectionsHint removed - collections now in hamburger menu
  const [storiesScrolledPast, setStoriesScrolledPast] = useState(0);
  const [showPlayModePulse, setShowPlayModePulse] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [topicLikedCount, setTopicLikedCount] = useState<number>(0);
  
  // Track story views for PWA prompt trigger
  const { incrementStoriesViewed } = useStoryViewTracker(slug || '');

  // Connection warmup for in-app browsers (Gmail, etc.)
  // Primes the Supabase connection to reduce cold-start latency
  useEffect(() => {
    if (isInAppBrowser()) {
      if (import.meta.env.DEV) console.log('🔌 Warming up Supabase connection for in-app browser...');
      const warmupConnection = async () => {
        try {
          await supabase.from('topics').select('id').limit(1);
          if (import.meta.env.DEV) console.log('✅ Connection warmup complete');
        } catch {
          if (import.meta.env.DEV) console.log('⚠️ Connection warmup failed (non-critical)');
        }
      };
      warmupConnection();
    }
  }, []);
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
    ensureFilterStoryIndexLoaded,
    // Split loading states for instant header
    topicLoading,
    storiesLoading,
    isRefreshing,
    usingCachedContent,
    // Error handling for mobile
    loadError,
    retryCount,
    retryLoad,
    // Filter readiness state
    filterIndexLoading,
    filterOptionsReady,
    // Prefetch for "More like this"
    prefetchForFilter
  } = useHybridTopicFeedWithKeywords(slug || '');

  // OPTIMIZED: Fetch all secondary metadata in parallel via cached React Query
  const { data: topicMetadata } = useTopicMetadata(topic?.id, slug);
  const avgDailyStories = topicMetadata.avgDailyStories;
  const playModeEnabled = topicMetadata.playModeEnabled;
  const siftEnabled = topicMetadata.siftEnabled;
  const latestDaily = topicMetadata.latestDailyRoundup;
  const latestWeekly = topicMetadata.latestWeeklyRoundup;
  const quizCardsEnabled = topicMetadata.quizCardsEnabled;

  // OPTIMIZED: Batch fetch reaction counts for all visible stories in single RPC call
  const visibleStoryIds = useMemo(() => {
    return filteredContent
      .filter(item => item.type === 'story')
      .map(item => item.id)
      .filter(Boolean);
  }, [filteredContent]);
  
  const { countsMap: reactionCountsMap, updateCounts: updateReactionCounts } = useStoriesReactionsBatch(
    visibleStoryIds,
    topic?.id || ''
  );

  useEffect(() => {
    if (isModalOpen) {
      ensureFilterStoryIndexLoaded();
    }
  }, [isModalOpen, ensureFilterStoryIndexLoaded]);

  // Extract matching keywords/landmarks/organizations from a story
  const computeStoryFilterMatches = useCallback(
    (story: any) => {
      if (!topic) return [];

      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const combinedText = `${story?.title ?? ''} ${(story?.slides ?? []).map((s: any) => s?.content ?? '').join(' ')}`.toLowerCase();

      const candidates = [
        { type: 'landmark' as const, items: topic.landmarks || [] },
        { type: 'organization' as const, items: topic.organizations || [] },
        { type: 'keyword' as const, items: topic.keywords || [] },
      ];

      const matches: { type: 'landmark' | 'organization' | 'keyword'; value: string }[] = [];

      // Pass 1: word-boundary matches (best quality) - collect up to 2
      for (const group of candidates) {
        for (const raw of group.items) {
          const value = String(raw || '').trim();
          if (value.length <= 2) continue;
          if (value.toLowerCase() === topic.name?.toLowerCase()) continue;

          const escaped = escapeRegExp(value.toLowerCase());
          const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (wordBoundaryRegex.test(combinedText)) {
            matches.push({ type: group.type, value });
            if (matches.length >= 2) break;
          }
        }
        if (matches.length >= 2) break;
      }

      // Pass 2: looser substring match if we need more matches
      if (matches.length < 2) {
        for (const group of candidates) {
          for (const raw of group.items) {
            const value = String(raw || '').trim();
            if (value.length <= 2) continue;
            if (value.toLowerCase() === topic.name?.toLowerCase()) continue;
            if (matches.some(m => m.value.toLowerCase() === value.toLowerCase())) continue;

            if (combinedText.includes(value.toLowerCase())) {
              matches.push({ type: group.type, value });
              if (matches.length >= 2) break;
            }
          }
          if (matches.length >= 2) break;
        }
      }

      return matches;
    },
    [topic]
  );

  // Prefetch filter results when "More like this" button appears
  const handlePrefetchFilter = useCallback(
    (story: any) => {
      const matches = computeStoryFilterMatches(story);
      if (matches.length === 0) return;

      // Compute the combined keywords that will be passed to the server
      const combinedKeywords = matches.map(m => m.value);
      prefetchForFilter(combinedKeywords, []);
    },
    [computeStoryFilterMatches, prefetchForFilter]
  );

  const handleMoreLikeThis = useCallback(
    (story: any) => {
      if (!topic) return;

      const matches = computeStoryFilterMatches(story);

      if (matches.length === 0) {
        setIsModalOpen(true);
        toast({
          title: 'No match found',
          description: 'Open filters to pick a keyword, landmark, or organization.',
        });
        return;
      }

      clearAllFilters();

      // Apply all matches (OR logic - each toggle adds to the filter)
      for (const match of matches) {
        if (match.type === 'landmark') toggleLandmark(match.value);
        else if (match.type === 'organization') toggleOrganization(match.value);
        else toggleKeyword(match.value);
      }

      // Scroll to top of feed so user sees filtered results
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const filterDescription = matches.map(m => m.value).join(' or ');
      toast({
        title: 'Filtering',
        description: filterDescription,
      });
    },
    [topic, computeStoryFilterMatches, clearAllFilters, toggleLandmark, toggleOrganization, toggleKeyword, toast]
  );

  // Debug helper for resetting collections hint removed - collections now in hamburger menu

  // Track visitor for analytics
  const visitorId = useVisitorTracking(topic?.id);
  
  // Track story impressions when stories are viewed
  const { trackImpression } = useStoryImpressionTracking(topic?.id);

  // Detect first scroll and show pulse animation on play mode icon
  useEffect(() => {
    if (!playModeEnabled || !slug) return;

    // Check if user has already seen the pulse
    const pulseKey = `play_mode_pulse_shown_${slug}`;
    const hasSeenPulse = localStorage.getItem(pulseKey);

    if (hasSeenPulse) return;

    const handleScroll = () => {
      if (!hasScrolled) {
        setHasScrolled(true);
        setShowPlayModePulse(true);
        localStorage.setItem(pulseKey, 'true');
        
        // Stop pulsing after 3 seconds
        setTimeout(() => {
          setShowPlayModePulse(false);
        }, 3000);
      }
    };

    window.addEventListener('scroll', handleScroll, { once: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [playModeEnabled, slug, hasScrolled]);

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
    // Track story impression when user swipes through slides
    trackImpression(storyId);
    
    if (!shouldShowNotificationPrompt || !topic?.id) return;

    setStoriesWithSwipes(prev => {
      const newSet = new Set(prev);
      newSet.add(storyId);
      return newSet;
    });
  }, [shouldShowNotificationPrompt, topic?.id, trackImpression]);

  // Collections hint removed - collections now in hamburger menu

  // Track when user scrolls past stories they've engaged with
  const handleStoryScrolledPast = useCallback(() => {
    setStoriesScrolledPast(prev => prev + 1);
    
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
  }, [storiesWithSwipes, shouldShowNotificationPrompt, scrollPastStoriesWithSwipes, topic?.id, storiesScrolledPast, slug]);

  // Update favicon based on topic branding (pass full branding config for optimized variants)
  const branding = topic?.branding_config as any;
  useTopicFavicon(branding);

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

  // Optimization #5: Defer secondary hooks until main feed has rendered
  const { sentimentCards } = useSentimentCards(storiesLoading ? undefined : topic?.id);
  const { data: pulseData } = useCommunityPulseKeywords(storiesLoading ? '' : (topic?.id || ''));
  const { data: insightCards = [] } = useAutomatedInsightCards(
    storiesLoading ? undefined : topic?.id, 
    !storiesLoading && (topic?.automated_insights_enabled ?? true)
  );
  
  // Optimization #5: Defer secondary hooks until main feed has rendered
  const { unansweredQuestions: quizQuestions, visitorId: quizVisitorId, markAsAnswered } = useQuizCards(
    storiesLoading ? undefined : topic?.id, 
    !storiesLoading && quizCardsEnabled, 
    user?.id
  );
  
  const { votes: parliamentaryVotes, hasData: hasParliamentaryData } = useParliamentaryInsightCards(
    storiesLoading ? undefined : topic?.id,
    topic?.topic_type,
    !storiesLoading && (topic as any)?.parliamentary_tracking_enabled
  );
  
  const { votes: parliamentaryDigestVotes, hasData: hasParliamentaryDigest } = useParliamentaryDigestCards(
    storiesLoading ? undefined : topic?.id,
    topic?.topic_type,
    !storiesLoading && (topic as any)?.parliamentary_tracking_enabled
  );
  

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

  // Note: Visitor tracking already called at line 155

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

  // Intersection Observer for infinite scroll with mobile-specific optimization
  const isAndroid = /Android/.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;
  
  const lastStoryElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    // Mobile-specific: More aggressive rootMargin for better perceived performance
    const rootMargin = isMobile ? '400px' : '100px';
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    }, {
      threshold: 0.1,
      rootMargin
    });
    
    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, loadMore, isMobile]);
  

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Optimization #2: Shared IntersectionObserver for story view tracking
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    
    sharedStoryObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            incrementStoriesViewed();
            sharedStoryObserverRef.current?.unobserve(entry.target);
            storyObserverMapRef.current.delete(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      sharedStoryObserverRef.current?.disconnect();
      storyObserverMapRef.current.clear();
    };
  }, [incrementStoriesViewed]);

  // Optimization #6: Pre-compute filter matches into a Map
  const filterMatchesMap = useMemo(() => {
    const map = new Map<string, { type: 'landmark' | 'organization' | 'keyword'; value: string }[]>();
    if (!topic) return map;
    filteredContent.forEach(item => {
      if (item.type === 'story') {
        map.set(item.id, computeStoryFilterMatches(item.data));
      }
    });
    return map;
  }, [filteredContent, topic, computeStoryFilterMatches]);

  // Optimization #1: Memoize the entire feed render loop
  const feedItems = useMemo(() => {
    // Defensive duplicate detection
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
    
    // Apply ghost filter FIRST to create displayable content array
    const displayableContent = filteredContent.filter(contentItem => {
      if (contentItem.type !== 'story') return true;
      const story = contentItem.data as any;
      const hasRealSlides = story.slides?.length > 0 && 
        !story.slides[0]?.id?.startsWith('placeholder-') &&
        story.slides[0]?.content !== 'Loading...';
      return hasRealSlides;
    });
    
    const lastDisplayableStoryIndex = displayableContent.length > 0 
      ? displayableContent.map(item => item.type).lastIndexOf('story')
      : -1;
    
    return displayableContent.map((contentItem, index) => {
      const items: React.ReactNode[] = [];
      
      const storyIndex = displayableContent.slice(0, index + 1).filter(item => item.type === 'story').length;
      
      if (contentItem.type === 'story') {
        const story = contentItem.data as any;
        const storyShareUrl = buildShareUrl(`/feed/${slug}/story/${story.id}`);
        
        items.push(
          <div
            key={`story-${story.id}`}
            className="w-full max-w-2xl"
            ref={(node) => {
              if (index === lastDisplayableStoryIndex) {
                lastStoryElementRef(node);
              }
              if (node && sharedStoryObserverRef.current) {
                storyObserverMapRef.current.set(node, story.id);
                sharedStoryObserverRef.current.observe(node);
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
              onMoreLikeThis={handleMoreLikeThis}
              onPrefetchFilter={handlePrefetchFilter}
              prefetchedReactionCounts={reactionCountsMap.get(story.id)}
              onReactionCountsChange={updateReactionCounts}
            />
          </div>
        );

        if (index === 4) {
          items.push(
            <div key="inline-pwa-card" className="w-full max-w-2xl">
              <InlinePWACard
                topicName={topic?.name || ''}
                topicSlug={slug || ''}
                topicIcon={topic?.branding_config?.icon_url || topic?.branding_config?.logo_url}
                storiesScrolledPast={storiesScrolledPast}
              />
            </div>
          );
        }
      }

      // Community pulse cards
      if (shouldShowCommunityPulseCard(storyIndex) && shouldShowCommunityPulse && topic && pulseData) {
        items.push(
          <div key={`community-pulse-${storyIndex}`} className="w-full max-w-2xl">
            <CommunityPulseSlides
              keywords={pulseData.keywords}
              timeframe="48h"
              mostActiveThreadUrl={pulseData.mostActiveThread?.url}
              mostActiveThreadTitle={pulseData.mostActiveThread?.title}
            />
          </div>
        );
      }

      // Sentiment cards - wrapped in Suspense for lazy loading
      if (shouldShowSentiment(storyIndex) && sentimentCards.length > 0) {
        const keywordCards = sentimentCards.filter(card => card.card_type !== 'comparison');
        const comparisonCards = sentimentCards.filter(card => card.card_type === 'comparison');
        const totalSentimentCardsShown = getSentimentIndex(storyIndex);
        const showComparison = (totalSentimentCardsShown + 1) % 4 === 0 && comparisonCards.length > 0;
        
        let sentimentCard;
        if (showComparison) {
          const comparisonIndex = Math.floor(totalSentimentCardsShown / 4) % comparisonCards.length;
          sentimentCard = comparisonCards[comparisonIndex];
        } else {
          const keywordSlotsUsed = totalSentimentCardsShown - Math.floor(totalSentimentCardsShown / 4);
          const keywordIndex = keywordSlotsUsed % keywordCards.length;
          sentimentCard = keywordCards[keywordIndex];
        }
        
        if (sentimentCard) {
          items.push(
            <div key={`sentiment-${sentimentCard.id}-${index}`} className="w-full max-w-2xl">
              <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
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
              </Suspense>
            </div>
          );
        }
      }

      // Automated insight cards
      if (shouldShowAutomatedInsight(storyIndex) && insightCards.length > 0 && topic?.automated_insights_enabled) {
        const cardIndex = getAutomatedInsightIndex(storyIndex) % insightCards.length;
        const insightCard = insightCards[cardIndex];
        
        items.push(
          <div key={`insight-${insightCard.id}-${index}`} className="w-full max-w-2xl">
            <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
              <AutomatedInsightCard 
                card={insightCard} 
                topicSlug={slug}
              />
            </Suspense>
          </div>
        );
        trackInsightCardDisplay(insightCard.id);
      }

      // Events accordion
      if (shouldShowEvents(storyIndex) && topic?.id && topic?.events_enabled) {
        items.push(
          <div key={`events-${storyIndex}`} className="w-full max-w-2xl">
            <EventsAccordion topicId={topic.id} isOwner={false} />
          </div>
        );
      }

      // Quiz cards
      if (shouldShowQuiz(storyIndex) && quizQuestions.length > 0 && quizCardsEnabled) {
        const quizIndex = getQuizIndex(storyIndex) % quizQuestions.length;
        const quizQuestion = quizQuestions[quizIndex];
        
        if (quizQuestion) {
          items.push(
            <div key={`quiz-${quizQuestion.id}-${storyIndex}`} className="w-full max-w-2xl">
              <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
                <QuizCard
                  question={quizQuestion}
                  visitorId={quizVisitorId}
                  userId={user?.id}
                  topicSlug={slug}
                  onAnswered={markAsAnswered}
                />
              </Suspense>
            </div>
          );
        }
      }

      // Parliamentary insight cards
      if (shouldShowParliamentary(storyIndex) && hasParliamentaryData && parliamentaryVotes.length > 0) {
        items.push(
          <div key={`parliamentary-insight-${storyIndex}`} className="w-full max-w-2xl">
            <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
              <ParliamentaryInsightCard votes={parliamentaryVotes} topicSlug={slug} />
            </Suspense>
          </div>
        );
      }

      // Parliamentary weekly digest
      if (shouldShowParliamentaryDigest(storyIndex) && hasParliamentaryDigest && parliamentaryDigestVotes.length > 0) {
        items.push(
          <div key={`parliamentary-digest-${storyIndex}`} className="w-full max-w-2xl">
            <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
              <ParliamentaryDigestCard votes={parliamentaryDigestVotes} topicSlug={slug} />
            </Suspense>
          </div>
        );
      }

      // Flashback card
      if (shouldShowFlashback(storyIndex) && topic?.id && topicMetadata?.this_time_last_month_enabled) {
        items.push(
          <div key="flashback-insight" className="w-full max-w-2xl">
            <Suspense fallback={<Skeleton className="w-full h-48 rounded-lg" />}>
              <FlashbackInsightsPanel topicId={topic.id} topicSlug={slug} />
            </Suspense>
          </div>
        );
      }

      // Email briefing sign-up card
      if (shouldShowEmailBriefing(storyIndex) && topic?.id && topicMetadata?.emailSubscriptionsEnabled) {
        items.push(
          <div key={`email-briefing-${storyIndex}`} className="w-full max-w-2xl">
            <InlineEmailSignupCard
              topicId={topic.id}
              topicName={topic.name}
              topicSlug={slug || ''}
              topicLogoUrl={topic.branding_config?.logo_url}
            />
          </div>
        );
      }

      return items;
    }).flat();
  }, [
    filteredContent, slug, topic, lastStoryElementRef, handleStorySwipe,
    handleStoryScrolledPast, handleMoreLikeThis, handlePrefetchFilter,
    reactionCountsMap, updateReactionCounts, storiesScrolledPast,
    shouldShowCommunityPulse, pulseData, sentimentCards, insightCards,
    quizQuestions, quizCardsEnabled, quizVisitorId, user?.id, markAsAnswered,
    parliamentaryVotes, hasParliamentaryData, parliamentaryDigestVotes,
    hasParliamentaryDigest, topicMetadata, filterMatchesMap
  ]);

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

  // Show mobile-friendly error overlay when load fails
  if (loadError && !topic && !loading) {
    return (
      <div className="min-h-screen feed-background">
        <MobileLoadErrorOverlay 
          error={loadError}
          onRetry={retryLoad}
          retryCount={retryCount}
          isRetrying={loading}
        />
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
        stories={filteredContent.slice(0, 20).map(item => ({ id: item.data.id, title: item.data.title, created_at: item.data.created_at }))}
      />

      {/* Onboarding Orchestrator */}
      <FeedOnboardingOrchestrator
        topicSlug={slug || ''}
        playModeEnabled={playModeEnabled}
        config={{
          welcomeCardEnabled: (topic.branding_config as any)?.welcome_card_enabled,
          welcomeCardHeadline: (topic.branding_config as any)?.welcome_card_headline,
          welcomeCardCtaText: (topic.branding_config as any)?.welcome_card_cta_text,
          welcomeCardAboutLink: (topic.branding_config as any)?.welcome_card_about_link,
          aboutPageEnabled: (topic.branding_config as any)?.about_page_enabled,
        }}
      />

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
                      <MapPin className="w-4 h-4 text-primary" />
                    ) : (
                      <Hash className="w-4 h-4 text-primary" />
                    )}
                    <span className="font-semibold text-lg">{topic.name}</span>
                  </div>
                )}
              {/* Background refresh is invisible - no indicator shown */}
              </div>
              {/* Clear filters button in sticky header */}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear filters
                </button>
              )}
              <div className="flex items-center gap-2">
                {/* Subscribe dropdown */}
                <SubscribeMenu
                  topicName={topic.name}
                  topicId={topic.id}
                  showLabel={false}
                  showPulse={shouldShowNotificationPrompt}
                />

                {/* Play Mode - Shows immediately, hides only if explicitly disabled */}
                <PlayModeMenu 
                  slug={slug!} 
                  showPulse={showPlayModePulse}
                  showLabel={false}
                  siftEnabled={siftEnabled}
                  hidden={playModeEnabled === false}
                />

                {/* Hamburger menu with about, filter, daily/weekly, archive */}
                <FeedHamburgerMenu
                  slug={slug!}
                  aboutPageEnabled={(topic.branding_config as any)?.about_page_enabled}
                  latestDaily={latestDaily}
                  latestWeekly={latestWeekly}
                  hasActiveFilters={hasActiveFilters}
                  onOpenFilters={() => setIsModalOpen(true)}
                  onClearFilters={clearAllFilters}
                  filterOptionsReady={filterOptionsReady}
                  loading={loading}
                  contentLength={filteredContent.length}
                />

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
          {/* Top-left: Live badge */}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            {isLive && avgDailyStories > 1 ? (
              <span 
                data-onboarding="live-badge"
                className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border transition-colors duration-300 ${
                  isRefreshing 
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' 
                    : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRefreshing ? 'bg-blue-400' : 'bg-green-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isRefreshing ? 'bg-blue-500' : 'bg-green-500'}`}></span>
                </span>
                {isRefreshing ? 'Updating...' : `Live • ${Math.round(avgDailyStories)}/day`}
              </span>
            ) : isLive ? (
              <span 
                data-onboarding="live-badge"
                className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border transition-colors duration-300 ${
                  isRefreshing 
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' 
                    : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRefreshing ? 'bg-blue-400' : 'bg-green-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isRefreshing ? 'bg-blue-500' : 'bg-green-500'}`}></span>
                </span>
                {isRefreshing ? 'Updating...' : 'Live'}
              </span>
            ) : null}
          </div>

          {/* About moved to hamburger menu - no top-right icon needed */}

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
                    <MapPin className="w-6 h-6 text-primary" />
                  ) : (
                    <Hash className="w-6 h-6 text-primary" />
                  )}
                  <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {topic.name}
                  </h1>
                </div>
              )}
              
              {/* Refreshing state is now shown in the Live pill */}
              
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

            {/* Action buttons - Play, Subscribe, and Hamburger menu */}
            <div className="flex items-center justify-center gap-2 pt-2">
              {/* Subscribe dropdown */}
              <div data-onboarding="notifications">
                <SubscribeMenu
                  topicName={topic.name}
                  topicId={topic.id}
                  showPulse={shouldShowNotificationPrompt}
                />
              </div>

              {/* Play Mode - Shows immediately, hides only if explicitly disabled */}
              <div data-onboarding="play-mode">
                <PlayModeMenu 
                  slug={slug!} 
                  showPulse={showPlayModePulse}
                  siftEnabled={siftEnabled}
                  hidden={playModeEnabled === false}
                />
              </div>

              {/* Hamburger menu with about, filter, daily/weekly, archive */}
              <FeedHamburgerMenu
                slug={slug!}
                aboutPageEnabled={(topic.branding_config as any)?.about_page_enabled}
                latestDaily={latestDaily}
                latestWeekly={latestWeekly}
                hasActiveFilters={hasActiveFilters}
                onOpenFilters={() => setIsModalOpen(true)}
                onClearFilters={clearAllFilters}
                filterOptionsReady={filterOptionsReady}
                loading={loading}
                contentLength={filteredContent.length}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`container mx-auto px-1 md:px-4 py-8 ${isScrolled ? 'pt-16' : ''}`}>

        {/* Active filters banner with clear button */}
        {hasActiveFilters && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-center gap-2">
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
              {selectedLandmarks.map((landmark) => (
                <Badge
                  key={`landmark-${landmark}`}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{landmark}</span>
                  <button
                    onClick={() => toggleLandmark(landmark)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedOrganizations.map((org) => (
                <Badge
                  key={`org-${org}`}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{org}</span>
                  <button
                    onClick={() => toggleOrganization(org)}
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
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
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
            {/* Optimization #1: Memoized feed items rendered below */}
            {feedItems}
            {/* Universal bottom sentinel for infinite scroll */}
            {hasMore && (
              <div 
                ref={(el) => {
                  if (el && lastStoryElementRef) {
                    lastStoryElementRef(el);
                    if (import.meta.env.DEV) console.log('🔭 Bottom sentinel mounted, infinite scroll active');
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
      <CookieConsent variant="feed" />
    </div>
  );
};

export default TopicFeed;