import React, { useState, useEffect, useMemo } from 'react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Download, Pin, MessageCircle, ExternalLink, RefreshCw } from 'lucide-react';
import arrowRightSvg from '@/assets/arrow-right.svg';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getRelativeTimeLabel, getRelativeTimeColor, isNewlyPublished, getNewFlagColor, isNewStory, getPopularBadgeStyle, isPopularStory } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { EmblaSlideCarousel } from '@/components/ui/embla-slide-carousel';
import { createSafeHTML, sanitizeContentWithLinks } from '@/lib/sanitizer';
import { useStoryInteractionTracking } from '@/hooks/useStoryInteractionTracking';
import { optimizeImageUrl } from '@/lib/imageOptimization';
import { useDeviceOptimizations } from '@/lib/deviceUtils';
import { HandSwipeHint } from '@/components/HandSwipeHint';
import { AnimatePresence, motion } from 'framer-motion';
import { shortenUrl } from '@/lib/urlShortener';

// Hook to detect network speed (adjusted for device tier)
const useNetworkSpeed = () => {
  const [isFastConnection, setIsFastConnection] = useState(true);
  const optimizations = useDeviceOptimizations();
  
  useEffect(() => {
    const connection = (navigator as any).connection 
      || (navigator as any).mozConnection 
      || (navigator as any).webkitConnection;
    
    if (!connection) {
      // On old iOS, be conservative; otherwise assume fast
      setIsFastConnection(!optimizations.shouldAggressivelyLazyLoadImages);
      return;
    }
    
    const checkConnection = () => {
      const effectiveType = connection.effectiveType;
      const saveData = connection.saveData;
      
      // On old iOS, always treat as slow for conservative loading
      if (optimizations.shouldAggressivelyLazyLoadImages) {
        setIsFastConnection(false);
        return;
      }
      
      // Only load video on 4g or fast 3g without data saver mode
      const isFast = (effectiveType === '4g' || effectiveType === '3g') && !saveData;
      setIsFastConnection(isFast);
    };
    
    checkConnection();
    
    connection.addEventListener('change', checkConnection);
    return () => connection.removeEventListener('change', checkConnection);
  }, [optimizations.shouldAggressivelyLazyLoadImages]);
  
  return isFastConnection;
};

interface Story {
  id: string;
  slug?: string; // URL-friendly slug for shareable links
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
  animated_illustration_url?: string;
  cover_illustration_prompt?: string;
  popularity_data?: {
    period_type: string;
    swipe_count: number;
    rank_position: number;
  };
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    links?: Array<{
      start: number;
      end: number;
      url: string;
      text: string;
    }>;
  }>;
  article: {
    source_url: string;
    region: string;
    published_at?: string;
  };
  is_teaser?: boolean; // Flag for stories generated from snippets
  mp_name?: string;
  mp_party?: string; // Party affiliation for parliamentary stories
  constituency?: string;
  tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
}

interface StoryCarouselProps {
  story: Story;
  storyUrl?: string;
  topicId?: string; // Add topicId for tracking
  storyIndex?: number; // Add story index for "New" flag logic
  isRoundupView?: boolean; // Flag to indicate if this is a roundup view
  onStorySwipe?: (storyId: string) => void; // Callback when user swipes on a story
  onStoryScrolledPast?: () => void; // Callback when story scrolls out of view
  topicName?: string; // Topic name for branded WhatsApp share
  topicSlug?: string; // Topic slug for branded WhatsApp share
  onMoreLikeThis?: (story: Story) => void;
  onPrefetchFilter?: (story: Story) => void;
  /** Pre-fetched reaction counts from batch hook */
  prefetchedReactionCounts?: {
    thumbsUp: number;
    thumbsDown: number;
    userReaction: 'like' | 'discard' | null;
  };
  /** Callback to update batch counts after reaction */
  onReactionCountsChange?: (storyId: string, counts: { thumbsUp: number; thumbsDown: number; userReaction: 'like' | 'discard' | null }) => void;
}

export default function StoryCarousel({ 
  story, 
  storyUrl, 
  topicId, 
  storyIndex = 0, 
  isRoundupView = false, 
  onStorySwipe, 
  onStoryScrolledPast, 
  topicName, 
  topicSlug, 
  onMoreLikeThis,
  onPrefetchFilter,
  prefetchedReactionCounts,
  onReactionCountsChange
}: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showMoreLikeThis, setShowMoreLikeThis] = useState(false);

  // Show "More like this" immediately on first swipe, and trigger prefetch
  useEffect(() => {
    if (currentSlideIndex > 0 && !showMoreLikeThis && onMoreLikeThis) {
      setShowMoreLikeThis(true);
      // Trigger prefetch as soon as user starts swiping
      onPrefetchFilter?.(story);
    }
  }, [currentSlideIndex, showMoreLikeThis, onMoreLikeThis, onPrefetchFilter, story]);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iOSVersion = isIOS ? parseInt((navigator.userAgent.match(/OS (\d+)_/i) || ['', '0'])[1]) : 0;
  const { trackShareClick, trackSourceClick } = useStoryInteractionTracking();
  const [hasTrackedSwipe, setHasTrackedSwipe] = useState(false);
  const isFastConnection = useNetworkSpeed(); // Network speed detection
  
  // iOS-specific: Preload next slide image for smoother transitions
  useEffect(() => {
    if (!isIOS || !story.slides[currentSlideIndex + 1]) return;
    
    const nextSlide = story.slides[currentSlideIndex + 1];
    if (story.cover_illustration_url && currentSlideIndex === 0) {
      // Preload cover for first slide
      const img = new Image();
      img.src = optimizeImageUrl(story.cover_illustration_url, { quality: 80 });
    }
  }, [currentSlideIndex, story, isIOS]);
  
  // iOS-specific: Use lower quality video for iPhone 12 and below (iOS < 15)
  const shouldUseVideo = useMemo(() => {
    if (!isIOS) return isFastConnection && story.animated_illustration_url;
    
    // Use static image on iOS < 15 (iPhone 12 baseline)
    const isOlderIOS = iOSVersion < 15;
    return !isOlderIOS && isFastConnection && story.animated_illustration_url;
  }, [isIOS, iOSVersion, isFastConnection, story.animated_illustration_url]);
  
  const [isFirstCard, setIsFirstCard] = useState(false);
  
  // Detect parliamentary stories (legacy — no new ones created)
  const isParliamentaryStory = (story as any).is_parliamentary === true;

  const storyBadges = useMemo<React.ReactNode[]>(() => {
    const badges: React.ReactNode[] = [];
    
    // Most Popular badge for top 2 stories in roundups only
    if (isRoundupView && storyIndex !== undefined && storyIndex < 2) {
      badges.push(
        <Badge
          key="most-popular"
          className="text-xs px-2 py-1 scale-80 origin-left bg-gradient-to-r from-purple-dark to-purple-bright text-white border-0 font-semibold flex items-center gap-1"
        >
          <Pin className="w-3 h-3" />
          Most Popular
        </Badge>
      );
      return badges;
    }
    
    // Add satirical/comment indicator
    if (story.tone === 'satirical') {
      badges.push(
        <Badge
          key="satirical"
          variant="outline"
          className="text-xs px-2 py-1 scale-80 origin-left bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
        >
          🤔
        </Badge>
      );
    }
    
    // Add rhyming couplet indicator
    if (story.tone === 'rhyming_couplet') {
      badges.push(
        <Badge
          key="rhyming"
          variant="outline"
          className="text-xs px-2 py-1 scale-80 origin-left bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
        >
          ✒️
        </Badge>
      );
    }
    
    const isNew = isNewStory(storyIndex);

    if (isNew) {
      badges.push(
        <Badge
          key="new"
          variant="outline"
          className={`text-xs px-2 py-1 scale-80 origin-left ${getNewFlagColor()}`}
        >
          New
        </Badge>
      );
      return badges;
    }

    if (story.popularity_data && isPopularStory(story.popularity_data)) {
      badges.push(
        <Badge
          key="popular"
          variant="outline"
          className={`text-xs px-2 py-1 scale-80 origin-left ${getPopularBadgeStyle()}`}
        >
          Popular
        </Badge>
      );
    }

    const storyPublishDate = story.article?.published_at || story.created_at;
    const timeLabel = storyPublishDate ? getRelativeTimeLabel(storyPublishDate) : null;
    if (timeLabel) {
      badges.push(
        <Badge
          key="time"
          variant="outline"
          className={`text-xs px-2 py-1 scale-80 origin-left ${getRelativeTimeColor(storyPublishDate)}`}
        >
          {timeLabel}
        </Badge>
      );
    }

    return badges;
  }, [isRoundupView, storyIndex, story.popularity_data, story.article?.published_at, story.created_at, story.tone]);

  const teaserBadge = story.is_teaser ? (
    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
      Teaser
    </Badge>
  ) : null;
  
  // Remove fit-to-height scaling functionality
  
  // Defensive checks for slides data
  const validSlides = story.slides && Array.isArray(story.slides) && story.slides.length > 0 ? story.slides : [];
  const safeSlideIndex = Math.max(0, Math.min(currentSlideIndex, validSlides.length - 1));
  const currentSlide = validSlides[safeSlideIndex];
  const isFirstSlide = safeSlideIndex === 0;
  const isLastSlide = safeSlideIndex === validSlides.length - 1;

  // Note: Placeholder slides are now ghosted at the feed level in TopicFeed.tsx
  


  const nextSlide = () => {
    if (!isLastSlide && validSlides.length > 0) {
      setCurrentSlideIndex(Math.min(currentSlideIndex + 1, validSlides.length - 1));
      // Track swipe when user swipes to next slide
      if (!hasTrackedSwipe && onStorySwipe) {
        setHasTrackedSwipe(true);
        onStorySwipe(story.id);
      }
    }
  };

  const prevSlide = () => {
    if (!isFirstSlide) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    if (validSlides.length > 0) {
      setCurrentSlideIndex(Math.max(0, Math.min(index, validSlides.length - 1)));
      // Track swipe on any slide navigation
      if (!hasTrackedSwipe && onStorySwipe && index > 0) {
        setHasTrackedSwipe(true);
        onStorySwipe(story.id);
      }
    }
  };


  const handleShare = async () => {
    console.log('Share button clicked for story:', story.id);
    
    // Track share click
    if (topicId) {
      trackShareClick(story.id, topicId, navigator.share ? 'native' : 'clipboard');
    }

    // Use story slug for shorter, readable URLs; fallback to UUID for backward compatibility
    const storyIdentifier = (story as any).slug || story.id;
    const longUrl = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/share-page/${storyIdentifier}`;
    
    // Shorten the URL (falls back to original on failure)
    const shareUrl = await shortenUrl(longUrl);
    const shareText = `Check out this story: ${story.title}`;
    
    console.log('Share URL:', shareUrl);
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: story.title,
          text: shareText,
          url: shareUrl,
        });
      } else {
        const clipboardText = `${story.title}\n\n${shareUrl}`;
        await navigator.clipboard.writeText(clipboardText);
        
        import('@/components/ui/use-toast').then(({ toast }) => {
          toast({
            title: "Link copied!",
            description: "Story link has been copied to your clipboard.",
          });
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      console.error('Share failed:', error);
      import('@/components/ui/use-toast').then(({ toast }) => {
        toast({
          title: "Share failed",
          description: "Unable to share this story. Please try again.",
          variant: "destructive",
        });
      });
    }
  };

  const handleWhatsAppShare = async () => {
    console.log('WhatsApp share clicked for story:', story.id);
    
    if (topicId) {
      trackShareClick(story.id, topicId, 'whatsapp');
    }

    const storyIdentifier = (story as any).slug || story.id;
    const longUrl = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/share-page/${storyIdentifier}`;
    
    // Shorten the URL (falls back to original on failure)
    const shareUrl = await shortenUrl(longUrl);

    const topicNameText = topicName ? `${topicName} | ` : '';
    const shareText = `${topicNameText}${story.title}`;
    const whatsappMessage = `${shareText}\n\n${shareUrl}`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      window.location.href = `whatsapp://send?text=${encodeURIComponent(whatsappMessage)}`;
    } else {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownloadImage = () => {
    // This function would be implemented when carousel images are available
    console.log('Download image functionality will be available when carousel images are generated');
  };


  // Determine if this is the first card (for animation)
  useEffect(() => {
    const checkIfFirstCard = () => {
      const cards = document.querySelectorAll('[data-story-card]');
      const currentCardElement = document.querySelector(`[data-story-card][data-story-id="${story.id}"]`);
      setIsFirstCard(currentCardElement === cards[0]);
    };
    
    checkIfFirstCard();
    // Re-check when cards are added/removed
    const observer = new MutationObserver(checkIfFirstCard);
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  }, [story.id]);

  // Track when story scrolls out of view after being interacted with
  useEffect(() => {
    if (!hasTrackedSwipe || !onStoryScrolledPast) return;

    const element = document.querySelector(`[data-story-card][data-story-id="${story.id}"]`);
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // When story exits viewport (scrolled past)
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            onStoryScrolledPast();
            observer.disconnect(); // Only trigger once
          }
        });
      },
      { threshold: 0 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [story.id, hasTrackedSwipe, onStoryScrolledPast]);

  // Remove auto-fit scaling logic

  // Parse content for last slide styling and ensure source attribution
  const parseContentForLastSlide = (content: string, links: any[] = []) => {
    if (!isLastSlide) return { mainContent: content, ctaContent: null, sourceUrl: null, contentWithLinks: renderContentWithLinks(content, links) };
    
    // Look for CTA patterns (removed "Comment, like, share.")
    const ctaPatterns = [
      /Like, share\./i,
      /Summarised by/i,
      /Support local journalism/i
    ];
    
    let splitIndex = -1;
    for (const pattern of ctaPatterns) {
      const match = content.search(pattern);
      if (match !== -1) {
        splitIndex = match;
        break;
      }
    }
    
    let mainContent = content;
    let ctaContent = null;
    
    if (splitIndex !== -1) {
      mainContent = content.substring(0, splitIndex).trim();
      ctaContent = content.substring(splitIndex).trim().replace(/^Comment, like, share\.\s*/i, 'Like, share. ');
    }
    
    // Safe URL parsing with try/catch for source attribution
    let sourceDomain = 'source';
    let validSourceUrl = null;
    
    try {
      if (story.article?.source_url && story.article.source_url !== '#') {
        const url = new URL(story.article.source_url);
        sourceDomain = url.hostname.replace('www.', '');
        validSourceUrl = story.article.source_url;
      }
    } catch (error) {
      console.warn('Invalid source URL:', story.article?.source_url);
    }
    
    // Format original article date if available
    const originalDateText = story.article?.published_at ? 
      ` (Originally published ${format(new Date(story.article.published_at), 'MMM d, yyyy')})` : 
      '';
    
    const sourceLinkHtml = validSourceUrl
      ? `<a href="${validSourceUrl}" target="_blank" rel="noopener noreferrer" class="underline text-primary hover:text-primary/80">Read the full story at ${sourceDomain}${originalDateText}</a>`
      : `Read the full story at ${sourceDomain}${originalDateText}`;
    
    // If we have existing CTA content, append source link; otherwise, use source link as CTA content
    const finalCtaContent = ctaContent 
      ? `${ctaContent}\n\n${sourceLinkHtml}` 
      : sourceLinkHtml;
    
    return {
      mainContent,
      ctaContent: finalCtaContent,
      sourceUrl: validSourceUrl,
      contentWithLinks: renderContentWithLinks(mainContent, links)
    };
  };

  const renderContentWithLinks = (content: string, links: any[] = []) => {
    if (!links || links.length === 0) {
      return content;
    }

    const parts = [];
    let lastIndex = 0;

    // Sort links by start position
    const sortedLinks = [...links].sort((a: any, b: any) => a.start - b.start);

    sortedLinks.forEach((link: any, index: number) => {
      // Add text before link
      if (link.start > lastIndex) {
        parts.push(content.substring(lastIndex, link.start));
      }

      // Add link HTML
      parts.push(`<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline transition-colors font-medium">${link.text}</a>`);

      lastIndex = link.end;
    });

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.join('');
  };

  // Parliamentary slide renderer removed — parliamentary content now uses dedicated feed cards only

  // Dynamic text sizing based on content length
  const getTextSize = (content: string, isTitle: boolean, isLaterSlide: boolean = false) => {
    const length = content.length;
    if (isTitle) {
      // Increased by one size point for better readability
      if (length < 50) return "text-4xl md:text-5xl lg:text-6xl";
      if (length < 100) return "text-3xl md:text-4xl lg:text-5xl";
      return "text-2xl md:text-3xl lg:text-4xl";
    } else {
      // Increased by one size point for better readability and card fill
      if (length < 80) return isLaterSlide ? "text-4xl md:text-5xl lg:text-6xl" : "text-2xl md:text-3xl lg:text-4xl";
      if (length < 150) return isLaterSlide ? "text-3xl md:text-4xl lg:text-5xl" : "text-xl md:text-2xl lg:text-3xl";
      if (length < 250) return isLaterSlide ? "text-2xl md:text-3xl lg:text-4xl" : "text-lg md:text-xl lg:text-2xl";
      return isLaterSlide ? "text-xl md:text-2xl lg:text-3xl" : "text-base md:text-lg lg:text-xl";
    }
  };

  // Defensive sort: ensure slides are always in correct order
  const sortedSlides = [...validSlides].sort((a, b) => a.slide_number - b.slide_number);
  
  // Validation: check if slides are in sequential order
  useEffect(() => {
    const slideNumbers = sortedSlides.map(s => s.slide_number);
    const isSequential = slideNumbers.every((num, idx) => num === idx + 1);
    
    if (!isSequential) {
      console.warn('⚠️ StoryCarousel: Slides not in sequential order!', {
        storyId: story.id.substring(0, 8),
        slideNumbers,
        expected: sortedSlides.map((_, idx) => idx + 1)
      });
    }
    
    if (sortedSlides[0]?.slide_number !== 1) {
      console.error('🚨 StoryCarousel: First slide is not slide_number 1!', {
        storyId: story.id.substring(0, 8),
        firstSlideNumber: sortedSlides[0]?.slide_number
      });
    }
  }, [sortedSlides, story.id]);
  
  // Memoize slide components to prevent re-renders during swipe
  const slideComponents = useMemo(() => sortedSlides.map((slide, index) => {
    
    // Standard slide rendering
    const { mainContent, ctaContent, sourceUrl, contentWithLinks } = parseContentForLastSlide(slide?.content || 'Content not available', slide?.links);
    const hasImage = story.cover_illustration_url && index === 0;
    const isLast = index === validSlides.length - 1;
    
    return (
      <div key={slide.id} className="h-full w-full">
        {hasImage ? (
          // First slide with image - use flex layout
          <div className="h-full flex flex-col">
            {/* Cover Illustration - Full card width */}
            <div className="relative w-full h-80 md:h-96 overflow-hidden">
              {story.animated_illustration_url && isFastConnection ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={story.cover_illustration_url}
                  className="w-full h-full object-cover"
                  preload="none"
                >
                  <source src={story.animated_illustration_url} type="video/mp4" />
                  {/* Fallback to static image if video fails */}
                  <img
                    src={optimizeImageUrl(story.cover_illustration_url, { 
                      width: 800, 
                      height: 600, 
                      quality: 85 
                    }) || story.cover_illustration_url}
                    alt={`Cover illustration for ${story.title}`}
                    className="w-full h-full object-cover"
                  />
                </video>
              ) : (
                <img
                  src={optimizeImageUrl(story.cover_illustration_url, { 
                    width: 800, 
                    height: 600, 
                    quality: 85 
                  }) || story.cover_illustration_url}
                  alt={`Cover illustration for ${story.title}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            
            {/* Content below image */}
            <div className="flex-1 flex items-center justify-center p-6 pb-14 md:p-8 md:pb-16">
              <div className="w-full max-w-lg mx-auto text-center flex flex-col h-full justify-center">
                <div className={`leading-relaxed ${getTextSize(slide?.content || '', true)} font-lexend font-semibold uppercase text-balance`}>
                  <div dangerouslySetInnerHTML={createSafeHTML(
                    sanitizeContentWithLinks(slide?.content || 'Content not available', slide?.links),
                    true
                  )} />
                </div>
                
              </div>
            </div>
          </div>
        ) : (
          // Slides without image - use grid for perfect centering and fit-to-height on last slide
          <div className="h-full flex items-center justify-center p-6 pb-14 md:p-8 md:pb-16 overflow-hidden">
            <div className="w-full max-w-lg mx-auto text-center">
                 <div className={`leading-relaxed ${
                  index === 0 
                  ? `${getTextSize(slide?.content || '', true)} font-lexend font-semibold uppercase text-balance` 
                  : `${getTextSize(isLast ? mainContent : (slide?.content || ''), false, true)} font-light text-balance`
                }`}>
                  {/* Main story content with links */}
                  <div dangerouslySetInnerHTML={createSafeHTML(
                    isLast ? sanitizeContentWithLinks(mainContent) : sanitizeContentWithLinks(slide?.content || 'Content not available', slide?.links),
                    true
                  )} />
                      
                  {/* CTA content with special styling on last slide */}
                  {isLast && ctaContent && (
                    <div className="mt-4 pt-4 border-t border-muted">
                      <div 
                        className="text-sm md:text-base lg:text-lg font-bold text-muted-foreground text-balance"
                        dangerouslySetInnerHTML={createSafeHTML(
                          sanitizeContentWithLinks(ctaContent),
                          true
                        )}
                      />
                    </div>
                  )}
                 </div>
                 
             </div>
           </div>
        )}
      </div>
    );
  }), [sortedSlides, story, validSlides.length, isFastConnection]);

  const slidesForEmbla = slideComponents.length
    ? slideComponents
    : [
        <div
          key="no-content"
          className="h-full w-full flex items-center justify-center p-8 text-center text-muted-foreground"
        >
          <div className="space-y-2">
            <p className="text-sm font-medium">Story content is not available</p>
          </div>
        </div>,
      ];

  return (
    <article 
      itemScope 
      itemType="https://schema.org/Article"
      className="w-full"
    >
      <meta itemProp="headline" content={story.title} />
      <meta itemProp="author" content={story.author || 'Unknown'} />
      <meta itemProp="datePublished" content={story.created_at} />
      <Card 
        className={`w-full overflow-hidden shadow-lg feed-card ${isParliamentaryStory ? 'parliamentary-card border-l-4 border-l-primary' : ''}`} 
        data-story-card 
        data-story-id={story.id}
        style={{} as React.CSSProperties}
      >
        <div className="relative min-h-[600px] flex flex-col">
          {/* Header with subtle grey background */}
          <div className="p-4 border-b feed-card-header bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                {teaserBadge}
                {storyBadges}
              </div>
              {/* More like this - fades in after swipe */}
              <AnimatePresence>
                {showMoreLikeThis && onMoreLikeThis && (
                  <motion.button
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoreLikeThis(story);
                    }}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                  >
                    More like this
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Hand Swipe Hint - only show on first story */}
            {storyIndex === 0 && topicSlug && <HandSwipeHint topicSlug={topicSlug} />}
            
            <EmblaSlideCarousel
              slides={slidesForEmbla}
              height="100%"
              initialIndex={currentSlideIndex}
              showDots={slidesForEmbla.length > 1}
              dotStyle="instagram"
              onSlideChange={setCurrentSlideIndex}
              ariaLabel={`${story.title} story slides`}
              storyId={story.id}
              topicId={topicId}
            />
          </div>

          {/* Bottom section */}
          <div className="p-4">
            {/* Progress dots and source link */}
            <div className="flex flex-col items-center space-y-2 mb-4">
              
              {/* Enhanced source link */}
              {(() => {
                // Get source name from article's source, fallback to domain extraction, then 'source'
                let sourceName = (story.publication_name || '').trim();
                const sourceUrl = story.article?.source_url;
                
                // Treat generic placeholders as unknown
                const genericNames = ['eezee news', 'unknown publication', 'unknown'];
                if (genericNames.includes(sourceName.toLowerCase())) {
                  sourceName = '';
                }
                
                // Prefer extracted source fields if present
                // @ts-expect-error - optional shapes may exist on story
                const extractedSourceName = story.article?.source?.source_name || story.article?.source_name || (story as any).source_name;
                if (!sourceName && extractedSourceName) {
                  sourceName = String(extractedSourceName);
                }
                
                // Fallback to domain from URL
                if (!sourceName && sourceUrl && sourceUrl !== '#') {
                  try {
                    const url = new URL(sourceUrl);
                    sourceName = url.hostname.replace(/^www\./, '');
                  } catch {
                    sourceName = 'source';
                  }
                }
                
                // Always show source, even if no URL
                if (!sourceName) {
                  sourceName = 'source';
                }
                
                return sourceUrl && sourceUrl !== '#' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (topicId) {
                        trackSourceClick(story.id, topicId);
                      }
                      window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded-full transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    from {sourceName}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted text-muted-foreground rounded-full">
                    from {sourceName}
                  </span>
                );
              })()}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsAppShare}
                data-onboarding="whatsapp-share"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                title="Share on WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </article>
  );
}