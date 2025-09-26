import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Heart, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getRelativeTimeLabel, getRelativeTimeColor, isNewlyPublished, getNewFlagColor, isNewInFeed } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { createSafeHTML, sanitizeContentWithLinks } from '@/lib/sanitizer';

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
  cover_illustration_prompt?: string;
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
  topicName: string;
  storyUrl?: string;
}

export default function StoryCarousel({ story, topicName, storyUrl }: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(Math.floor(Math.random() * 50) + 10); // Random initial count
  
  // Fit-to-height for last slide
  const lastFitContainerRef = useRef<HTMLDivElement | null>(null);
  const lastFitInnerRef = useRef<HTMLDivElement | null>(null);
  const [lastScale, setLastScale] = useState(1);
  
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
    }
  };

  const toggleLove = () => {
    setIsLoved(!isLoved);
    setLoveCount(prev => isLoved ? prev - 1 : prev + 1);
  };

  const handleShare = () => {
    // Always use the story URL if available, otherwise construct one
    const shareUrl = storyUrl || `${window.location.origin}/story/${story.id}`;
    const shareText = `Check out this story: ${story.title}`;
    
    if (navigator.share) {
      navigator.share({
        title: story.title,
        text: shareText,
        url: shareUrl,
      });
    } else {
      // Fallback - copy to clipboard
      const clipboardText = `${story.title}\n\n${shareUrl}`;
      navigator.clipboard.writeText(clipboardText);
    }
  };

  const handleDownloadImage = () => {
    // This function would be implemented when carousel images are available
    console.log('Download image functionality will be available when carousel images are generated');
  };

  // Enhanced touch handling is now managed by useSwipeGesture hook

  // Auto fit last slide text to available height
  useEffect(() => {
    const fit = () => {
      if (currentSlideIndex !== validSlides.length - 1) {
        setLastScale(1);
        return;
      }
      const container = lastFitContainerRef.current;
      const inner = lastFitInnerRef.current;
      if (!container || !inner) return;
      // Measure natural content height; transforms don't affect scrollHeight
      const available = container.clientHeight;
      const needed = inner.scrollHeight;
      if (available <= 0 || needed <= 0) return;
      const ratio = available / needed;
      // Clamp to sensible minimum so text remains legible
      const nextScale = Math.max(0.7, Math.min(1, ratio));
      setLastScale(nextScale);
    };

    fit();

    const ro = lastFitContainerRef.current ? new ResizeObserver(fit) : null;
    if (ro && lastFitContainerRef.current) ro.observe(lastFitContainerRef.current);
    window.addEventListener('resize', fit);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [currentSlideIndex, validSlides.length, currentSlide?.content]);

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
      if (length < 50) return "text-3xl md:text-4xl lg:text-5xl";
      if (length < 100) return "text-2xl md:text-3xl lg:text-4xl";
      return "text-xl md:text-2xl lg:text-3xl";
    } else {
      // Much bigger text for slides after the first
      if (length < 80) return isLaterSlide ? "text-3xl md:text-4xl lg:text-5xl" : "text-xl md:text-2xl lg:text-3xl";
      if (length < 150) return isLaterSlide ? "text-2xl md:text-3xl lg:text-4xl" : "text-lg md:text-xl lg:text-2xl";
      if (length < 250) return isLaterSlide ? "text-xl md:text-2xl lg:text-3xl" : "text-base md:text-lg lg:text-xl";
      return isLaterSlide ? "text-lg md:text-xl lg:text-2xl" : "text-sm md:text-base lg:text-lg";
    }
  };

  // Create slide components for SwipeCarousel
  const slideComponents = validSlides.map((slide, index) => {
    const { mainContent, ctaContent, sourceUrl, contentWithLinks } = parseContentForLastSlide(slide?.content || 'Content not available', slide?.links);
    const hasImage = story.cover_illustration_url && index === 0;
    const isLast = index === validSlides.length - 1;
    
    return (
      <div key={slide.id} className="h-full w-full">
        {hasImage ? (
          // First slide with image - use flex layout
          <div className="h-full flex flex-col">
            {/* Cover Illustration */}
            <div className="relative w-full h-64 md:h-80 mb-4 p-4 overflow-hidden">
              <img
                src={story.cover_illustration_url}
                alt={`Cover illustration for ${story.title}`}
                className="w-full h-full object-contain bg-white rounded-lg"
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
                
              </div>
            </div>
          </div>
        ) : (
          // Slides without image - use grid for perfect centering and fit-to-height on last slide
          <div className="h-full grid place-items-center p-6 md:p-8 overflow-hidden" ref={isLast ? lastFitContainerRef : undefined}>
            <div
              ref={isLast ? lastFitInnerRef : undefined}
              style={isLast ? { transform: `scale(${lastScale})`, transformOrigin: 'center center' } : undefined}
              className="flex flex-col h-full justify-center"
            >
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
              </div>
              
            </div>
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="flex justify-center px-4">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg hover-scale">
        <div className="relative bg-background min-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm font-medium">
                {topicName}
              </Badge>
              {story.is_teaser && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Teaser
                </Badge>
              )}
              {(() => {
                // Use story updated_at for feed freshness (when it was published to feed)
                const storyPublishDate = story.updated_at;
                
                // Show "New" if story was published to feed in last 24 hours
                if (isNewInFeed(storyPublishDate)) {
                  return (
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-1 ${getNewFlagColor()}`}
                    >
                      New
                    </Badge>
                  );
                }
                
                // Otherwise show relative time based on story publish date
                const timeLabel = getRelativeTimeLabel(storyPublishDate);
                if (timeLabel) {
                  return (
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-1 ${getRelativeTimeColor(storyPublishDate)}`}
                    >
                      {timeLabel}
                    </Badge>
                  );
                }
                
                return null;
              })()}
            </div>
            <span className="text-sm text-muted-foreground">
              {currentSlideIndex + 1} of {validSlides.length}
            </span>
          </div>

          {/* SwipeCarousel */}
          <div className="flex-1">
            <SwipeCarousel
              slides={slideComponents}
              height="100%"
              initialIndex={currentSlideIndex}
              showDots={false}
              onSlideChange={setCurrentSlideIndex}
              ariaLabel={`${story.title} story slides`}
            />
          </div>

          {/* Bottom section */}
          <div className="p-4">
            {/* Progress dots and source link */}
            <div className="flex flex-col items-center space-y-2 mb-4">
              {validSlides.length > 1 && (
                <div className="flex justify-center space-x-2">
                  {validSlides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentSlideIndex 
                          ? 'bg-primary scale-125' 
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      }`}
                    />
                  ))}
                </div>
              )}
              
              {/* Source link */}
              {story.article?.source_url && story.article.source_url !== '#' && (
                <a
                  href={story.article.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
                >
                  Source
                </a>
              )}
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