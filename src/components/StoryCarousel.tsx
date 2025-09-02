import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Heart, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article: {
    source_url: string;
    region: string;
  };
}

interface StoryCarouselProps {
  story: Story;
  topicName: string;
}

export default function StoryCarousel({ story, topicName }: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(Math.floor(Math.random() * 50) + 10); // Random initial count
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);
  
  const currentSlide = story.slides[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === story.slides.length - 1;


  const nextSlide = () => {
    if (!isLastSlide) {
      setSlideDirection('next');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex + 1);
        setSlideDirection(null);
      }, 150);
    }
  };

  const prevSlide = () => {
    if (!isFirstSlide) {
      setSlideDirection('prev');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex - 1);
        setSlideDirection(null);
      }, 150);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlideIndex(index);
  };

  const toggleLove = () => {
    setIsLoved(!isLoved);
    setLoveCount(prev => isLoved ? prev - 1 : prev + 1);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: story.title,
        text: currentSlide.content,
        url: story.article.source_url,
      });
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(`${story.title}\n\n${currentSlide.content}\n\nRead more: ${story.article.source_url}`);
    }
  };

  const handleDownloadImage = () => {
    // This function would be implemented when carousel images are available
    console.log('Download image functionality will be available when carousel images are generated');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(0);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 30;
    const isRightSwipe = distance < -30;

    if (isLeftSwipe && !isLastSlide) {
      nextSlide();
    }
    if (isRightSwipe && !isFirstSlide) {
      prevSlide();
    }
  };


  // Parse content for last slide styling and ensure source attribution
  const parseContentForLastSlide = (content: string) => {
    if (!isLastSlide) return { mainContent: content, ctaContent: null, sourceUrl: null };
    
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
    
    // Always add source attribution on final slide
    const sourceDomain = story.article?.source_url ? 
      new URL(story.article.source_url).hostname.replace('www.', '') : 
      'source';
    
    const sourceAttribution = `Read the full story at ${sourceDomain}`;
    
    // If we have existing CTA content, append source; otherwise, use source as CTA content
    const finalCtaContent = ctaContent ? 
      `${ctaContent}\n\n${sourceAttribution}` : 
      sourceAttribution;
    
    return {
      mainContent,
      ctaContent: finalCtaContent,
      sourceUrl: story.article?.source_url
    };
  };

  const { mainContent, ctaContent, sourceUrl } = parseContentForLastSlide(currentSlide.content);

  // Dynamic text sizing based on content length
  const getTextSize = (content: string, isTitle: boolean) => {
    const length = content.length;
    if (isTitle) {
      if (length < 50) return "text-3xl md:text-4xl lg:text-5xl";
      if (length < 100) return "text-2xl md:text-3xl lg:text-4xl";
      return "text-xl md:text-2xl lg:text-3xl";
    } else {
      if (length < 80) return "text-xl md:text-2xl lg:text-3xl";
      if (length < 150) return "text-lg md:text-xl lg:text-2xl";
      if (length < 250) return "text-base md:text-lg lg:text-xl";
      return "text-sm md:text-base lg:text-lg";
    }
  };

  return (
    <Card className="overflow-hidden">
      <div 
        className="relative bg-background min-h-[600px] flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <Badge variant="secondary" className="text-sm font-medium">
            {topicName}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {currentSlideIndex + 1} of {story.slides.length}
          </span>
        </div>

        {/* Slide Content */}
        <div className="relative flex-1 flex items-center justify-center">
          {/* Invisible navigation areas */}
          {story.slides.length > 1 && (
            <>
              {/* Left area - previous slide */}
              {!isFirstSlide && (
                <button
                  onClick={prevSlide}
                  className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
                  aria-label="Previous slide"
                />
              )}
              {/* Right area - next slide */}
              {!isLastSlide && (
                <button
                  onClick={nextSlide}
                  className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
                  aria-label="Next slide"
                />
              )}
            </>
          )}
          
          <div className="p-8 w-full max-w-2xl">
            <div className={`mb-8 transition-all duration-300 ${
              slideDirection === 'next' ? 'animate-fade-out translate-x-[-20px]' : 
              slideDirection === 'prev' ? 'animate-fade-out translate-x-[20px]' : 
              'animate-fade-in'
            }`}>
              <div className={`text-center leading-relaxed ${
                  currentSlideIndex === 0 
                  ? `${getTextSize(currentSlide.content, true)} font-bold uppercase text-balance` 
                  : `${getTextSize(isLastSlide ? mainContent : currentSlide.content, false)} font-light text-balance`
              }`}>
                {/* Main story content */}
                {isLastSlide ? mainContent : currentSlide.content}
                    
                {/* CTA content with special styling on last slide */}
                {isLastSlide && ctaContent && (
                  <div className="mt-4 pt-4 border-t border-muted">
                    <div 
                      className="text-sm md:text-base lg:text-lg font-bold text-muted-foreground text-balance"
                      dangerouslySetInnerHTML={{
                        __html: ctaContent
                          .replace(
                            /visit ([^\s]+)/gi, 
                            'visit <a href="https://$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">$1</a>'
                          )
                          .replace(
                            /call (\d{5}\s?\d{6})/gi,
                            'call <a href="tel:$1" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">$1</a>'
                          )
                          .replace(
                            /Read the full story at ([^\s\n]+)/gi,
                            sourceUrl ? 
                              `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">Read the full story at $1</a>` :
                              'Read the full story at <span class="text-primary font-extrabold">$1</span>'
                          )
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div className="p-4">
          {/* Progress dots */}
          {story.slides.length > 1 && (
            <div className="flex justify-center space-x-2 mb-4">
              {story.slides.map((_, index) => (
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
  );
}