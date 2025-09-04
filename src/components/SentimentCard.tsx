import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";

interface SentimentSlide {
  type: 'hero' | 'statistic' | 'quote' | 'references';
  content: string;
  order: number;
  metadata?: Record<string, any>;
}

interface SentimentCardProps {
  id: string;
  keywordPhrase: string;
  content: {
    headline: string;
    statistics: string;
    key_quote?: string;
    external_sentiment?: string;
    summary: string;
  };
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
  }>;
  sentimentScore: number;
  confidenceScore: number;
  analysisDate: string;
  cardType: 'quote' | 'trend' | 'comparison' | 'timeline';
  slides?: SentimentSlide[];
}

export const SentimentCard = ({
  keywordPhrase,
  content,
  sources,
  sentimentScore,
  slides = []
}: SentimentCardProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  // Use slides if available, otherwise create from content
  const displaySlides = slides.length > 0 ? slides : [
    {
      type: 'hero' as const,
      content: content.headline,
      order: 0,
      metadata: {}
    },
    ...(content.key_quote ? [{
      type: 'quote' as const,
      content: content.key_quote,
      order: 1,
      metadata: {}
    }] : []),
    {
      type: 'references' as const,
      content: `${sources.length} source${sources.length > 1 ? 's' : ''}`,
      order: 2,
      metadata: {}
    }
  ];
  const getSentimentBadge = () => {
    if (sentimentScore > 20) return { icon: <TrendingUp className="h-3 w-3" />, text: "Positive", variant: "secondary" as const };
    if (sentimentScore < -20) return { icon: <TrendingDown className="h-3 w-3" />, text: "Negative", variant: "destructive" as const };
    return { icon: <Minus className="h-3 w-3" />, text: "Neutral", variant: "outline" as const };
  };

  const nextSlide = () => {
    if (currentSlide < displaySlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
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

    if (isLeftSwipe && currentSlide < displaySlides.length - 1) {
      nextSlide();
    }
    if (isRightSwipe && currentSlide > 0) {
      prevSlide();
    }
  };

  const getTextSize = (content: string, isHero: boolean) => {
    const length = content.length;
    if (isHero) {
      if (length < 50) return "text-2xl md:text-3xl lg:text-4xl";
      if (length < 100) return "text-xl md:text-2xl lg:text-3xl";
      return "text-lg md:text-xl lg:text-2xl";
    } else {
      if (length < 80) return "text-lg md:text-xl lg:text-2xl";
      if (length < 150) return "text-base md:text-lg lg:text-xl";
      return "text-sm md:text-base lg:text-lg";
    }
  };

  const renderSlideContent = (slide: SentimentSlide) => {
    const currentSlideData = displaySlides[currentSlide];
    
    switch (slide.type) {
      case 'hero':
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, true)} font-bold text-balance`}>
            {slide.content}
          </div>
        );
      
      case 'quote':
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, false)} font-light italic text-balance`}>
            "{slide.content}"
          </div>
        );
      
      case 'statistic':
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, false)} font-bold text-balance`}>
            {slide.content}
          </div>
        );
      
      case 'references':
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, false)} font-light text-balance text-muted-foreground`}>
            {slide.content}
          </div>
        );
      
      default:
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, false)} font-light text-balance`}>
            {slide.content}
          </div>
        );
    }
  };

  const sentimentBadge = getSentimentBadge();

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
          <Badge variant={sentimentBadge.variant} className="text-sm font-medium flex items-center gap-1">
            {sentimentBadge.icon}
            {sentimentBadge.text}
          </Badge>
          {displaySlides.length > 1 && (
            <span className="text-sm text-muted-foreground">
              {currentSlide + 1} of {displaySlides.length}
            </span>
          )}
        </div>

        {/* Slide Content */}
        <div className="relative flex-1 flex items-center justify-center">
          {/* Invisible navigation areas */}
          {displaySlides.length > 1 && (
            <>
              {/* Left area - previous slide */}
              {currentSlide > 0 && (
                <button
                  onClick={prevSlide}
                  className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
                  aria-label="Previous slide"
                />
              )}
              {/* Right area - next slide */}
              {currentSlide < displaySlides.length - 1 && (
                <button
                  onClick={nextSlide}
                  className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
                  aria-label="Next slide"
                />
              )}
            </>
          )}
          
          <div className="p-8 w-full max-w-2xl">
            <div className="transition-all duration-300 animate-fade-in">
              {renderSlideContent(displaySlides[currentSlide])}
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div className="p-4">
          {/* Progress dots */}
          {displaySlides.length > 1 && (
            <div className="flex justify-center space-x-2">
              {displaySlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentSlide 
                      ? 'bg-primary scale-125' 
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};