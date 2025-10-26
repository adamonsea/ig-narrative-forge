import React, { useState, useEffect, useMemo } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Heart, Download } from 'lucide-react';
import arrowRightSvg from '@/assets/arrow-right.svg';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getRelativeTimeLabel, getRelativeTimeColor, isNewlyPublished, getNewFlagColor, isNewStory, getPopularBadgeStyle, isPopularStory } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { createSafeHTML, sanitizeContentWithLinks } from '@/lib/sanitizer';
import { useStoryInteractionTracking } from '@/hooks/useStoryInteractionTracking';
import { optimizeImageUrl } from '@/lib/imageOptimization';
// Force cache refresh

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
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
}

interface StoryCarouselProps {
  story: Story;
  storyUrl?: string;
  topicId?: string; // Add topicId for tracking
  storyIndex?: number; // Add story index for "New" flag logic
  onStorySwipe?: (storyId: string) => void; // Callback when user swipes on a story
  onStoryScrolledPast?: () => void; // Callback when story scrolls out of view
}

export default function StoryCarousel({ story, storyUrl, topicId, storyIndex = 0, onStorySwipe, onStoryScrolledPast }: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(Math.floor(Math.random() * 50) + 10); // Random initial count
  const { trackShareClick } = useStoryInteractionTracking();
  const [hasTrackedSwipe, setHasTrackedSwipe] = useState(false);
  
  const [isFirstCard, setIsFirstCard] = useState(false);
  
  // Detect parliamentary stories for banner styling
  const isParliamentaryStory = (story as any).is_parliamentary === true;
  
  type PartyColorTheme = {
    border: string;
    bg: string;
    gradient: string;
    header: string;
    accentText: string;
    pill: string;
    chip: string;
    icon: string;
    button: string;
  };

  const getPartyColors = (party: string | undefined): PartyColorTheme => {
    const baseTheme: PartyColorTheme = {
      border: 'border-l-4 border-l-slate-400',
      bg: 'bg-slate-50/40 dark:bg-slate-950/30',
      gradient: 'bg-gradient-to-br from-slate-100/70 via-white to-slate-50/60 dark:from-slate-950/70 dark:via-slate-950/60 dark:to-slate-900/50',
      header: 'bg-gradient-to-r from-slate-100/60 via-white to-transparent dark:from-slate-950/50 dark:via-slate-950/40',
      accentText: 'text-slate-700 dark:text-slate-100',
      pill: 'bg-slate-200 text-slate-800 dark:bg-slate-900/50 dark:text-slate-100',
      chip: 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200',
      icon: 'text-slate-600 dark:text-slate-200',
      button: 'bg-slate-600 hover:bg-slate-700 text-white'
    };

    if (!party) return baseTheme;

    const partyLower = party.toLowerCase();
    if (partyLower.includes('liberal democrat') || partyLower.includes('lib dem')) {
      return {
        border: 'border-l-4 border-l-amber-500',
        bg: 'bg-amber-50/30 dark:bg-amber-950/30',
        gradient: 'bg-gradient-to-br from-amber-50/80 via-white to-orange-100/70 dark:from-amber-950/40 dark:via-slate-950/60 dark:to-orange-900/30',
        header: 'bg-gradient-to-r from-amber-100/70 via-white to-transparent dark:from-amber-950/50 dark:via-slate-950/40',
        accentText: 'text-amber-700 dark:text-amber-200',
        pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-100',
        chip: 'border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-200',
        icon: 'text-amber-500 dark:text-amber-200',
        button: 'bg-amber-500 hover:bg-amber-600 text-white'
      };
    }
    if (partyLower.includes('conservative') || partyLower.includes('tory')) {
      return {
        border: 'border-l-4 border-l-blue-600',
        bg: 'bg-blue-50/30 dark:bg-blue-950/30',
        gradient: 'bg-gradient-to-br from-blue-50/80 via-white to-sky-100/70 dark:from-blue-950/50 dark:via-slate-950/60 dark:to-blue-900/30',
        header: 'bg-gradient-to-r from-blue-100/70 via-white to-transparent dark:from-blue-950/50 dark:via-slate-950/40',
        accentText: 'text-blue-700 dark:text-blue-200',
        pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-100',
        chip: 'border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-200',
        icon: 'text-blue-600 dark:text-blue-200',
        button: 'bg-blue-600 hover:bg-blue-700 text-white'
      };
    }
    if (partyLower.includes('labour')) {
      return {
        border: 'border-l-4 border-l-red-600',
        bg: 'bg-red-50/30 dark:bg-red-950/30',
        gradient: 'bg-gradient-to-br from-red-50/80 via-white to-rose-100/70 dark:from-red-950/50 dark:via-slate-950/60 dark:to-rose-900/30',
        header: 'bg-gradient-to-r from-red-100/70 via-white to-transparent dark:from-red-950/50 dark:via-slate-950/40',
        accentText: 'text-red-700 dark:text-red-200',
        pill: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-100',
        chip: 'border border-red-300 text-red-700 dark:border-red-700 dark:text-red-200',
        icon: 'text-red-600 dark:text-red-200',
        button: 'bg-red-600 hover:bg-red-700 text-white'
      };
    }
    if (partyLower.includes('green')) {
      return {
        border: 'border-l-4 border-l-green-600',
        bg: 'bg-green-50/30 dark:bg-green-950/30',
        gradient: 'bg-gradient-to-br from-green-50/80 via-white to-emerald-100/70 dark:from-green-950/50 dark:via-slate-950/60 dark:to-emerald-900/30',
        header: 'bg-gradient-to-r from-green-100/70 via-white to-transparent dark:from-green-950/50 dark:via-slate-950/40',
        accentText: 'text-green-700 dark:text-green-200',
        pill: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100',
        chip: 'border border-green-300 text-green-700 dark:border-green-700 dark:text-green-200',
        icon: 'text-green-600 dark:text-green-200',
        button: 'bg-green-600 hover:bg-green-700 text-white'
      };
    }
    if (partyLower.includes('reform')) {
      return {
        border: 'border-l-4 border-l-purple-600',
        bg: 'bg-purple-50/30 dark:bg-purple-950/30',
        gradient: 'bg-gradient-to-br from-purple-50/80 via-white to-fuchsia-100/70 dark:from-purple-950/50 dark:via-slate-950/60 dark:to-fuchsia-900/30',
        header: 'bg-gradient-to-r from-purple-100/70 via-white to-transparent dark:from-purple-950/50 dark:via-slate-950/40',
        accentText: 'text-purple-700 dark:text-purple-200',
        pill: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-100',
        chip: 'border border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-200',
        icon: 'text-purple-600 dark:text-purple-200',
        button: 'bg-purple-600 hover:bg-purple-700 text-white'
      };
    }
    if (partyLower.includes('snp')) {
      return {
        border: 'border-l-4 border-l-yellow-500',
        bg: 'bg-yellow-50/30 dark:bg-yellow-950/30',
        gradient: 'bg-gradient-to-br from-yellow-50/80 via-white to-amber-100/70 dark:from-yellow-950/45 dark:via-slate-950/60 dark:to-amber-900/30',
        header: 'bg-gradient-to-r from-yellow-100/70 via-white to-transparent dark:from-yellow-950/45 dark:via-slate-950/40',
        accentText: 'text-yellow-700 dark:text-yellow-200',
        pill: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100',
        chip: 'border border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-200',
        icon: 'text-yellow-600 dark:text-yellow-200',
        button: 'bg-yellow-500 hover:bg-yellow-600 text-slate-900'
      };
    }
    if (partyLower.includes('plaid')) {
      return {
        border: 'border-l-4 border-l-emerald-600',
        bg: 'bg-emerald-50/30 dark:bg-emerald-950/30',
        gradient: 'bg-gradient-to-br from-emerald-50/80 via-white to-teal-100/70 dark:from-emerald-950/50 dark:via-slate-950/60 dark:to-teal-900/30',
        header: 'bg-gradient-to-r from-emerald-100/70 via-white to-transparent dark:from-emerald-950/50 dark:via-slate-950/40',
        accentText: 'text-emerald-700 dark:text-emerald-200',
        pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100',
        chip: 'border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-200',
        icon: 'text-emerald-600 dark:text-emerald-200',
        button: 'bg-emerald-600 hover:bg-emerald-700 text-white'
      };
    }

    return baseTheme;
  };

  const partyColors = getPartyColors((story as any).mp_party);

  const getParliamentaryLayoutVariant = (storyId: string) => {
    if (!storyId) return 1;
    const codeSum = storyId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (codeSum % 3) + 1;
  };

  const parliamentaryLayoutVariant = getParliamentaryLayoutVariant(story.id);

  const mpName = (story as any).mp_name || story.author || 'Member of Parliament';
  const constituency = (story as any).constituency;
  const mpInitials = mpName
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'MP';

  const renderParliamentaryCta = (slide: any) => {
    if (!slide.links || slide.links.length === 0) return null;

    const primaryLink = slide.links[0];

    return (
      <Button
        size="lg"
        onClick={(e) => {
          e.stopPropagation();
          window.open(primaryLink.url, '_blank', 'noopener,noreferrer');
        }}
        className={`text-lg px-8 py-6 rounded-full shadow-sm transition ${partyColors.button}`}
      >
        {primaryLink.text || 'View vote details'}
      </Button>
    );
  };

  const storyBadges = useMemo<React.ReactNode[]>(() => {
    const badges: React.ReactNode[] = [];
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
  }, [storyIndex, story.popularity_data, story.article?.published_at, story.created_at]);

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

  // Early return if no valid slides
  if (!currentSlide || validSlides.length === 0) {
    console.error('StoryCarousel: No valid slides found for story', story.id);
    return (
      <div className="flex justify-center px-4">
        <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg">
          <div className="p-6 text-center text-muted-foreground">
            <p>Story content is not available</p>
          </div>
        </Card>
      </div>
    );
  }


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

  const toggleLove = () => {
    setIsLoved(!isLoved);
    setLoveCount(prev => isLoved ? prev - 1 : prev + 1);
  };

  const handleShare = async () => {
    console.log('Share button clicked for story:', story.id);
    
    // Track share click
    if (topicId) {
      trackShareClick(story.id, topicId, navigator.share ? 'native' : 'clipboard');
    }

    // Use the provided storyUrl or extract slug from current URL as fallback
    let shareUrl = storyUrl;
    if (!shareUrl) {
      const pathParts = window.location.pathname.split('/');
      const feedIndex = pathParts.indexOf('feed');
      if (feedIndex !== -1 && pathParts[feedIndex + 1]) {
        const currentSlug = pathParts[feedIndex + 1];
        shareUrl = `${window.location.origin}/feed/${currentSlug}/story/${story.id}`;
      } else {
        shareUrl = window.location.href; // Fallback to current URL
      }
    }
    const shareText = `Check out this story: ${story.title}`;
    
    console.log('Share URL:', shareUrl);
    console.log('Share text:', shareText);
    
    try {
      if (navigator.share) {
        console.log('Using native share API');
        await navigator.share({
          title: story.title,
          text: shareText,
          url: shareUrl,
        });
        console.log('Native share successful');
      } else {
        console.log('Using clipboard fallback');
        // Fallback - copy to clipboard
        const clipboardText = `${story.title}\n\n${shareUrl}`;
        await navigator.clipboard.writeText(clipboardText);
        console.log('Clipboard copy successful');
        
        // Show toast notification for clipboard copy
        import('@/components/ui/use-toast').then(({ toast }) => {
          toast({
            title: "Link copied!",
            description: "Story link has been copied to your clipboard.",
          });
        });
      }
    } catch (error) {
      // Check if the error is because the user cancelled the share
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Share cancelled by user');
        return; // Don't show error for user cancellation
      }
      
      console.error('Share failed:', error);
      
      // Show error toast only for actual errors, not cancellations
      import('@/components/ui/use-toast').then(({ toast }) => {
        toast({
          title: "Share failed",
          description: "Unable to share this story. Please try again.",
          variant: "destructive",
        });
      });
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

  // Parliamentary slide renderer with specific design/scale
  const renderParliamentarySlide = (slide: any, slideIndex: number) => {
    const lines = slide.content.split('\n').filter((line: string) => line.trim());
    const backgroundClass = parliamentaryLayoutVariant === 1 ? partyColors.bg : partyColors.gradient;
    const headerAccentClass = `uppercase tracking-[0.35em] text-xs font-semibold ${partyColors.accentText}`;

    if (parliamentaryLayoutVariant === 2) {
      if (slideIndex === 0) {
        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col gap-6 justify-center`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold ${partyColors.pill}`}>
                {mpInitials}
              </div>
              <div>
                <p className={headerAccentClass}>Parliamentary vote</p>
                <h1 className="text-4xl md:text-5xl font-bold leading-tight text-balance">{lines[0]}</h1>
              </div>
            </div>
            {lines[1] && <p className="text-sm text-muted-foreground">{lines[1]}</p>}
            {lines[2] && <p className="text-2xl md:text-3xl font-medium text-foreground text-balance">{lines[2]}</p>}
          </div>
        );
      }

      if (slideIndex === 1) {
        const voteDirection = lines.find((l: string) => l === 'AYE' || l === 'NO') || 'ABSTAIN';
        const isRebellion = slide.content.includes('Against party whip');
        const isAye = voteDirection === 'AYE';

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center`}>
            <div className="grid gap-8 md:grid-cols-[160px_1fr] items-center">
              <div className="flex flex-col items-start gap-3">
                <span className={headerAccentClass}>Vote</span>
                <span className={`text-6xl font-black ${isAye ? 'parl-aye' : 'parl-no'}`}>{voteDirection}</span>
              </div>
              <div className="space-y-4 text-left">
                <p className="text-base text-muted-foreground">
                  {isAye ? 'Backed the motion in Parliament' : voteDirection === 'NO' ? 'Opposed the motion in Parliament' : 'Abstained from the vote'}
                </p>
                {isRebellion && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-sm font-semibold text-red-600 dark:border-red-800/60 dark:bg-red-900/40 dark:text-red-200">
                    <span>🔥 Against party whip</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (slideIndex === 2) {
        const outcome = lines.find((l: string) => l === 'ACCEPTED' || l === 'REJECTED') || 'PENDING';
        const counts = lines.find((l: string) => l.includes('Ayes'));

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center`}>
            <div className="grid gap-6 md:grid-cols-2 items-center">
              <div>
                <span className={headerAccentClass}>Result</span>
                <p className="mt-4 text-4xl md:text-5xl font-bold text-foreground">{outcome}</p>
              </div>
              <div className="text-sm md:text-base text-muted-foreground md:text-right">
                {counts}
              </div>
            </div>
          </div>
        );
      }

      if (slideIndex === 3) {
        const category = lines.find((l: string) => l.startsWith('Category:'));
        const info = lines.find((l: string) => l.startsWith('Information:'));

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center gap-6 text-left`}>
            {category && <p className="text-sm font-semibold text-muted-foreground">{category}</p>}
            {info && <p className="text-xl md:text-2xl leading-relaxed text-balance">{info.replace('Information: ', '')}</p>}
          </div>
        );
      }

      if (slideIndex === 4) {
        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-16 flex items-center justify-center`}>
            {renderParliamentaryCta(slide)}
          </div>
        );
      }
    }

    if (parliamentaryLayoutVariant === 3) {
      if (slideIndex === 0) {
        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-between`}>
            <div className="space-y-3 text-left">
              <p className={headerAccentClass}>Constituency spotlight</p>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight text-balance">{lines[0]}</h1>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {lines[1] && <p>{lines[1]}</p>}
              {lines[2] && <p className="text-xl md:text-2xl font-semibold text-foreground text-balance">{lines[2]}</p>}
            </div>
          </div>
        );
      }

      if (slideIndex === 1) {
        const voteDirection = lines.find((l: string) => l === 'AYE' || l === 'NO') || 'ABSTAIN';
        const isRebellion = slide.content.includes('Against party whip');
        const isAye = voteDirection === 'AYE';

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center`}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className={`text-5xl font-black ${isAye ? 'parl-aye' : 'parl-no'}`}>{voteDirection}</span>
                <div className="flex-1 border-t border-dashed border-current opacity-20" />
                <span className={`text-xs font-semibold ${partyColors.accentText}`}>House of Commons</span>
              </div>
              {isRebellion && (
                <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-200">
                  <span>🔥 Rebellion alert</span>
                  <div className="h-px flex-1 bg-red-200 dark:bg-red-900/60" />
                </div>
              )}
              <p className="text-base text-muted-foreground">
                {isAye ? `${mpName} supported this motion in Parliament.` : voteDirection === 'NO' ? `${mpName} voted against this motion.` : `${mpName} did not register a vote.`}
              </p>
            </div>
          </div>
        );
      }

      if (slideIndex === 2) {
        const outcome = lines.find((l: string) => l === 'ACCEPTED' || l === 'REJECTED') || 'PENDING';
        const counts = lines.find((l: string) => l.includes('Ayes'));

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center gap-6`}>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-muted/60" />
              <span className={headerAccentClass}>Outcome</span>
              <div className="flex-1 h-px bg-muted/60" />
            </div>
            <p className="text-4xl md:text-5xl font-bold text-center text-foreground">{outcome}</p>
            {counts && <p className="text-sm text-muted-foreground text-center">{counts}</p>}
          </div>
        );
      }

      if (slideIndex === 3) {
        const category = lines.find((l: string) => l.startsWith('Category:'));
        const info = lines.find((l: string) => l.startsWith('Information:'));

        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-12 flex flex-col justify-center gap-5`}>
            {category && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${partyColors.chip}`}>
                  {category.replace('Category: ', '')}
                </span>
                <div className="h-px flex-1 bg-muted/40" />
              </div>
            )}
            {info && <p className="text-lg leading-relaxed text-center md:text-left text-balance">{info.replace('Information: ', '')}</p>}
          </div>
        );
      }

      if (slideIndex === 4) {
        return (
          <div className={`h-full w-full ${backgroundClass} ${partyColors.border} px-10 py-16 flex items-center justify-center`}>
            {renderParliamentaryCta(slide)}
          </div>
        );
      }
    }

    // Default layout (variant 1) closely matches legacy centre-aligned design
    if (slideIndex === 0) {
      return (
        <div className={`flex flex-col items-center justify-center h-full text-center px-8 py-12 ${partyColors.border} ${backgroundClass}`}>
          <div className={`text-4xl mb-4 ${partyColors.icon}`}>🗳️</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance">{lines[0]}</h1>
          {lines[1] && <p className="parl-small mb-6">{lines[1]}</p>}
          {lines[2] && <p className="text-xl md:text-2xl font-normal text-balance">{lines[2]}</p>}
        </div>
      );
    }

    if (slideIndex === 1) {
      const voteDirection = lines.find((l: string) => l === 'AYE' || l === 'NO') || 'ABSTAIN';
      const isRebellion = slide.content.includes('Against party whip');
      const isAye = voteDirection === 'AYE';

      return (
        <div className={`flex flex-col items-center justify-center h-full text-center px-8 py-16 ${partyColors.border} ${backgroundClass}`}>
          <p className="parl-small mb-4">Voted</p>
          <h2 className={`parl-xl ${isAye ? 'parl-aye' : 'parl-no'}`}>{voteDirection}</h2>
          {isRebellion && (
            <div className="mt-6 px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-full">
              <span className="parl-rebel text-sm">🔥 Against party whip</span>
            </div>
          )}
        </div>
      );
    }

    if (slideIndex === 2) {
      const outcome = lines.find((l: string) => l === 'ACCEPTED' || l === 'REJECTED') || 'PENDING';
      const counts = lines.find((l: string) => l.includes('Ayes'));

      return (
        <div className={`flex flex-col items-center justify-center h-full text-center px-8 py-16 ${partyColors.border} ${backgroundClass}`}>
          <p className="parl-small mb-4">Vote outcome</p>
          <h2 className="parl-large mb-6">{outcome}</h2>
          {counts && <p className="parl-small">{counts}</p>}
        </div>
      );
    }

    if (slideIndex === 3) {
      const category = lines.find((l: string) => l.startsWith('Category:'));
      const info = lines.find((l: string) => l.startsWith('Information:'));

      return (
        <div className={`flex flex-col items-center justify-center h-full text-center px-8 py-12 ${partyColors.border} ${backgroundClass}`}>
          {category && <p className="text-base md:text-lg font-medium mb-6">{category}</p>}
          {info && <p className="text-base md:text-xl">{info}</p>}
        </div>
      );
    }

    if (slideIndex === 4) {
      return (
        <div className={`flex flex-col items-center justify-center h-full px-8 py-16 ${partyColors.border} ${backgroundClass}`}>
          {renderParliamentaryCta(slide)}
        </div>
      );
    }

    // Fallback to standard rendering
    return null;
  };

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
  
  // Create slide components for SwipeCarousel
  const slideComponents = sortedSlides.map((slide, index) => {
    // Check if this is a parliamentary story and render accordingly
    if (isParliamentaryStory) {
      const parliamentaryContent = renderParliamentarySlide(slide, index);
      if (parliamentaryContent) {
        return <div key={slide.id} className="h-full w-full">{parliamentaryContent}</div>;
      }
    }
    
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
            </div>
            
            {/* Content below image */}
            <div className="flex-1 flex items-center justify-center p-6 md:p-8">
              <div className="w-full max-w-lg mx-auto text-center flex flex-col h-full justify-center">
                <div className={`leading-relaxed ${getTextSize(slide?.content || '', true)} font-bold uppercase text-balance`}>
                  <div dangerouslySetInnerHTML={createSafeHTML(
                    sanitizeContentWithLinks(slide?.content || 'Content not available', slide?.links),
                    true
                  )} />
                </div>
                
                {/* Arrow below content - show on all slides except the last */}
                {!isLast && validSlides.length > 1 && (
                  <div className="flex justify-center mt-8">
                    <motion.div
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="cursor-pointer"
                      onClick={nextSlide}
                    >
                      <img 
                        src={arrowRightSvg} 
                        alt="Next slide" 
                        className="w-[125px] h-[28px]"
                      />
                    </motion.div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // Slides without image - use grid for perfect centering and fit-to-height on last slide
          <div className="h-full flex items-center justify-center p-6 md:p-8 overflow-hidden">
            <div className="w-full max-w-lg mx-auto text-center">
                 <div className={`leading-relaxed ${
                  index === 0 
                  ? `${getTextSize(slide?.content || '', true)} font-bold uppercase text-balance` 
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
                 
                 {/* Arrow below content - show on all slides except the last */}
                 {!isLast && validSlides.length > 1 && (
                   <div className="flex justify-center mt-8">
                     <motion.div
                       initial={{ opacity: 0.6 }}
                       animate={{ opacity: [0.6, 1, 0.6] }}
                       transition={{
                         duration: 2,
                         repeat: Infinity,
                         ease: "easeInOut"
                       }}
                       className="cursor-pointer"
                       onClick={nextSlide}
                     >
                        <img 
                          src={arrowRightSvg} 
                          alt="Next slide" 
                          className="w-[125px] h-[28px]"
                        />
                     </motion.div>
                   </div>
                 )}
             </div>
           </div>
        )}
      </div>
    );
  });

  return (
    <div className="flex justify-center px-1 md:px-4">
      <Card className={`w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg feed-card ${isParliamentaryStory ? `parliamentary-card ${partyColors.border}` : ''}`} data-story-card data-story-id={story.id}>
        <div className="relative min-h-[600px] flex flex-col">
          {/* Header with subtle grey background */}
          <div className={`p-4 border-b feed-card-header ${isParliamentaryStory ? partyColors.header : ''}`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {teaserBadge}
                      {isParliamentaryStory ? (
                        <>
                          {(story as any).mp_party && (
                            <span className={`text-xs font-semibold ${partyColors.accentText}`}>
                              {(story as any).mp_party}
                            </span>
                          )}
                        </>
                      ) : (
                        storyBadges
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {currentSlideIndex + 1} of {validSlides.length}
                </span>
              </div>
              {isParliamentaryStory && storyBadges.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {storyBadges}
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 relative overflow-hidden">
            <SwipeCarousel
              slides={slideComponents}
              height="100%"
              initialIndex={currentSlideIndex}
              showDots={false}
              onSlideChange={setCurrentSlideIndex}
              ariaLabel={`${story.title} story slides`}
              storyId={story.id}
              topicId={topicId}
              showPreviewAnimation={isFirstCard}
              centerDragArea
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
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors underline font-medium"
                  >
                    from {sourceName}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">
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
                onClick={handleShare}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
              <Button
                variant={isLoved ? "default" : "outline"}
                size="sm"
                onClick={toggleLove}
                className="flex items-center gap-2"
              >
                <Heart className={`h-4 w-4 ${isLoved ? "fill-current" : ""}`} />
                {loveCount}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}