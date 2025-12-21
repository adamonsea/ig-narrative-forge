import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ExternalLink, MessageSquare } from "lucide-react";
import { useState } from "react";
import { EmblaSlideCarousel } from "@/components/ui/embla-slide-carousel";
import type { PulseKeyword } from "@/hooks/useCommunityPulseKeywords";

interface PulseSlide {
  type: 'hero' | 'keyword-detail' | 'cta';
  keyword?: PulseKeyword;
  keywords?: PulseKeyword[];
  threadUrl?: string;
  threadTitle?: string;
}

interface CommunityPulseSlidesProps {
  keywords: PulseKeyword[];
  timeframe?: string;
  mostActiveThreadUrl?: string;
  mostActiveThreadTitle?: string;
  subreddit?: string; // Subreddit name for the community
  topicName?: string; // Topic name as fallback for subreddit
}

export const CommunityPulseSlides = ({
  keywords,
  timeframe = '48h',
  mostActiveThreadUrl,
  mostActiveThreadTitle,
  subreddit,
  topicName
}: CommunityPulseSlidesProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (keywords.length === 0) {
    return (
      <Card className="p-8 text-center">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">No community pulse data yet</p>
        <p className="text-sm text-muted-foreground mt-2">Click "Refresh Now" to gather insights</p>
      </Card>
    );
  }

  // Limit to max 3 keywords
  const limitedKeywords = keywords.slice(0, 3);
  
  // Get subreddit from first keyword, prop, or derive from topic name (multi-tenant)
  const subredditName = subreddit || limitedKeywords[0]?.subreddit || topicName?.toLowerCase().replace(/\s+/g, '') || 'community';

  // Get sentiment color based on positive vs negative ratio
  const getSentimentColor = (keyword: PulseKeyword) => {
    const positiveRatio = keyword.positiveMentions / keyword.totalMentions;
    const negativeRatio = keyword.negativeMentions / keyword.totalMentions;
    
    if (positiveRatio > negativeRatio * 1.5) {
      return { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700' };
    }
    if (negativeRatio > positiveRatio * 1.5) {
      return { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700' };
    }
    return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' };
  };

  // Generate 5 slides: hero + 3 keyword details + CTA
  const slides: PulseSlide[] = [
    { type: 'hero', keywords: limitedKeywords },
    ...limitedKeywords.map(kw => ({ type: 'keyword-detail' as const, keyword: kw })),
    { type: 'cta', threadUrl: mostActiveThreadUrl || `https://reddit.com/r/${subredditName}`, threadTitle: mostActiveThreadTitle }
  ];

  const renderSlideContent = (slide: PulseSlide) => {
    switch (slide.type) {
      case 'hero':
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="text-center space-y-4">
                <h3 className="text-2xl font-bold text-foreground">Community Pulse</h3>
                
                <div className="flex flex-wrap justify-center gap-3 px-4">
                  {slide.keywords?.map((kw, idx) => {
                    const colors = getSentimentColor(kw);
                    return (
                      <div
                        key={idx}
                        className={`inline-flex items-center px-4 py-2 rounded-full ${colors.bg} border ${colors.border}`}
                      >
                        <span className={`text-base font-semibold ${colors.text}`}>
                          {kw.keyword}
                        </span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Last {timeframe}
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              Swipe to see details →
            </div>
          </div>
        );

      case 'keyword-detail':
        if (!slide.keyword) return null;
        const colors = getSentimentColor(slide.keyword);
        
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="text-center space-y-4">
                {/* Keyword name */}
                <div className={`inline-flex items-center px-5 py-3 rounded-full ${colors.bg} border ${colors.border}`}>
                  <span className={`text-2xl font-bold ${colors.text}`}>
                    {slide.keyword.keyword}
                  </span>
                </div>
                
                {/* Total mentions */}
                <div className="text-xl text-muted-foreground">
                  {slide.keyword.totalMentions} mention{slide.keyword.totalMentions !== 1 ? 's' : ''}
                </div>
                
                {/* Sentiment breakdown */}
                <div className="flex justify-center gap-4">
                  {slide.keyword.positiveMentions > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {slide.keyword.positiveMentions} positive
                    </Badge>
                  )}
                  {slide.keyword.negativeMentions > 0 && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-300">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      {slide.keyword.negativeMentions} negative
                    </Badge>
                  )}
                </div>
                
                {/* Quote */}
                {slide.keyword.quote && (
                  <blockquote className="text-lg italic text-foreground border-l-4 border-primary/30 pl-4 mx-4">
                    "{slide.keyword.quote}"
                  </blockquote>
                )}
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              Based on Reddit discussions
            </div>
          </div>
        );

      case 'cta':
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6">
              <div className="text-center space-y-4">
                <MessageSquare className="h-16 w-16 mx-auto text-primary/70" />
                <h3 className="text-2xl font-bold text-foreground">Join the Debate</h3>
                
                <p className="text-base text-muted-foreground px-4">
                  Discuss these topics with your community on Reddit
                </p>
                <Button 
                  asChild 
                  size="lg"
                  className="mx-auto"
                >
                  <a 
                    href={slide.threadUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2"
                  >
                    <span>Visit r/{subredditName}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              Share your thoughts with the community
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const slideComponents = slides.map((slide, index) => (
    <div key={index} className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {renderSlideContent(slide)}
      </div>
    </div>
  ));

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="w-full overflow-hidden shadow-lg hover-scale">
        <div className="relative h-[500px] flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/20">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <Badge variant="outline" className="text-sm font-medium">
              Community Pulse
            </Badge>
            {slides.length > 1 && (
              <span className="text-sm text-muted-foreground">
                {currentSlide + 1} of {slides.length}
              </span>
            )}
          </div>

          {/* SwipeCarousel */}
          <div className="flex-1">
            <EmblaSlideCarousel
              slides={slideComponents}
              height="100%"
              initialIndex={currentSlide}
              showDots={false}
              onSlideChange={setCurrentSlide}
              ariaLabel="Community pulse slides"
            />
          </div>

          {/* Progress dots */}
          {slides.length > 1 && (
            <div className="p-4">
              <div className="flex justify-center space-x-2">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentSlide 
                        ? 'bg-primary scale-125' 
                        : 'bg-muted-foreground/30'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
