import React, { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Send, Heart, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import html2canvas from 'html2canvas';

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
  const [isExporting, setIsExporting] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  
  const currentSlide = story.slides[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === story.slides.length - 1;

  const nextSlide = () => {
    if (!isLastSlide) {
      setSlideDirection('next');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex + 1);
        setSlideDirection(null);
      }, 200);
    }
  };

  const prevSlide = () => {
    if (!isFirstSlide) {
      setSlideDirection('prev');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex - 1);
        setSlideDirection(null);
      }, 200);
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

  // Export slide as image
  const exportSlideAsImage = async () => {
    if (!slideRef.current || isExporting) return;
    
    setIsExporting(true);
    
    try {
      // Temporarily hide interactive elements
      const interactiveElements = slideRef.current.querySelectorAll('[data-hide-on-export]');
      interactiveElements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      
      const canvas = await html2canvas(slideRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 1080,
        height: 1350, // Instagram portrait ratio
      });
      
      // Restore interactive elements
      interactiveElements.forEach(el => {
        (el as HTMLElement).style.display = '';
      });
      
      const link = document.createElement('a');
      link.download = `${topicName}-slide-${currentSlideIndex + 1}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting slide:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Parse content for last slide styling
  const parseContentForLastSlide = (content: string) => {
    if (!isLastSlide) return { mainContent: content, ctaContent: null };
    
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
    
    if (splitIndex === -1) {
      return { mainContent: content, ctaContent: null };
    }
    
    return {
      mainContent: content.substring(0, splitIndex).trim(),
      ctaContent: content.substring(splitIndex).trim().replace(/^Comment, like, share\.\s*/i, 'Like, share. ')
    };
  };

  const { mainContent, ctaContent } = parseContentForLastSlide(currentSlide.content);

  return (
    <Card className="overflow-hidden" ref={slideRef}>
      <div 
        className="relative bg-gradient-to-br from-background to-muted min-h-[600px] flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" data-hide-on-export>
          <Badge variant="secondary" className="text-sm font-medium">
            {topicName}
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportSlideAsImage}
              disabled={isExporting}
              className="text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentSlideIndex + 1} of {story.slides.length}
            </span>
          </div>
        </div>

        {/* Slide Content */}
        <div className="relative flex-1 flex items-center justify-center">
          <div className="p-8 w-full max-w-2xl">
            {/* Main Content */}
            <div className={`mb-8 transition-all duration-500 ${
              slideDirection === 'next' ? 'animate-slide-out-left' : 
              slideDirection === 'prev' ? 'animate-slide-out-right' : 
              'animate-slide-in'
            }`}>
              <div className={`text-center leading-relaxed ${
                  currentSlideIndex === 0 
                  ? "text-2xl md:text-3xl lg:text-4xl font-bold uppercase text-balance" 
                  : "text-lg md:text-xl lg:text-2xl xl:text-3xl font-light text-balance"
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
                            /(https?:\/\/[^\s]+)/g, 
                            '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">source website</a>'
                          )
                          .replace(
                            /source website/g,
                            '<a href="' + story.article.source_url + '" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">source website</a>'
                          )
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation arrows */}
          {story.slides.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={prevSlide}
                disabled={currentSlideIndex === 0}
                data-hide-on-export
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={nextSlide}
                disabled={currentSlideIndex === story.slides.length - 1}
                data-hide-on-export
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>

        {/* Bottom section */}
        <div className="p-4" data-hide-on-export>
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
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Send className="h-4 w-4" />
              Send  
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

          {/* Attribution */}
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <span className="font-medium">{topicName}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}