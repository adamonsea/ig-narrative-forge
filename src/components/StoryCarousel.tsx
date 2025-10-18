import React, { useState, useEffect, useRef } from 'react';
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
}

interface StoryCarouselProps {
  story: Story;
  storyUrl?: string;
  topicId?: string; // Add topicId for tracking
  storyIndex?: number; // Add story index for "New" flag logic
  onStoryView?: () => void; // Callback when user views/swipes a story
}

export default function StoryCarousel({ story, storyUrl, topicId, storyIndex = 0, onStoryView }: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(Math.floor(Math.random() * 50) + 10); // Random initial count
  const { trackShareClick } = useStoryInteractionTracking();
  const [hasTrackedView, setHasTrackedView] = useState(false);
  
  const [isFirstCard, setIsFirstCard] = useState(false);
  
  // Detect parliamentary stories for banner styling
  const isParliamentaryStory = (story as any).is_parliamentary === true;
  
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
      // Track view when user swipes to next slide on first story view
      if (!hasTrackedView && onStoryView) {
        setHasTrackedView(true);
        onStoryView();
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
      // Track view on any slide navigation
      if (!hasTrackedView && onStoryView && index > 0) {
        setHasTrackedView(true);
        onStoryView();
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

  // Track when story comes into view (for scrolling users)
  useEffect(() => {
    if (hasTrackedView || !onStoryView) return;

    const element = document.querySelector(`[data-story-card][data-story-id="${story.id}"]`);
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Track when story is 50% visible
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setHasTrackedView(true);
            onStoryView();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [story.id, hasTrackedView, onStoryView]);

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
                src={story.cover_illustration_url}
                alt={`Cover illustration for ${story.title}`}
                className="w-full h-full object-cover"
                style={{ imageRendering: 'crisp-edges' }}
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
      <Card className={`w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg feed-card ${isParliamentaryStory ? 'parliamentary-card' : ''}`} data-story-card data-story-id={story.id}>
        <div className={`relative ${isParliamentaryStory ? 'min-h-[300px]' : 'min-h-[600px]'} flex flex-col`}>
          {/* Header with subtle grey background */}
          <div className="flex items-center justify-between p-4 border-b feed-card-header">
            <div className="flex items-center gap-2">
              {story.is_teaser && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Teaser
                </Badge>
              )}
              {(() => {
                const badges = [];
                
                // Badge logic: If "New" flag exists, show only that
                const isNew = isNewStory(storyIndex);
                
                if (isNew) {
                  // Show only "New" flag when present
                  badges.push(
                    <Badge 
                      key="new"
                      variant="outline" 
                      className={`text-xs px-2 py-1 scale-80 origin-left ${getNewFlagColor()}`}
                    >
                      New
                    </Badge>
                  );
                } else {
                  // Show other badges only when "New" is not present
                  
                  // Show "Popular" badge for popular stories
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
                  
                  // Show time-based badge (prefers article published_at, falls back to story created_at)
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
                }
                
                return badges;
              })().map((badge, index) => (
                <React.Fragment key={index}>
                  {badge}
                </React.Fragment>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {currentSlideIndex + 1} of {validSlides.length}
            </span>
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