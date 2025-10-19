import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";
import { SwipeCarousel } from "@/components/ui/swipe-carousel";

interface SentimentSlide {
  type: 'hero' | 'mention-count' | 'trend-graph' | 'references';
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
  confidenceScore,
  slides = []
}: SentimentCardProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Extract mention count from statistics
  const getMentionCount = () => {
    if (!content.statistics) return sources.length;
    const match = content.statistics.match(/(\d+)\s*(mention|article|report|story)/i);
    return match ? parseInt(match[1]) : sources.length;
  };

  // Calculate trend comparison (simplified - would need historical data for real trend)
  const getTrendData = () => {
    const currentCount = getMentionCount();
    // Estimate previous week count based on sentiment confidence change
    // In a real implementation, this would query historical sentiment cards
    const previousCount = Math.max(0, Math.round(currentCount * 0.7)); // Placeholder
    const change = currentCount - previousCount;
    const isIncrease = change > 0;
    
    return {
      currentCount,
      previousCount,
      change: Math.abs(change),
      isIncrease,
      hasHistory: previousCount > 0
    };
  };

  // Simplified 4-slide design
  const displaySlides = [
    {
      type: 'hero' as const,
      content: keywordPhrase,
      order: 0,
      metadata: { sentimentScore }
    },
    {
      type: 'mention-count' as const,
      content: '',
      order: 1,
      metadata: { mentionCount: getMentionCount() }
    },
    {
      type: 'trend-graph' as const,
      content: '',
      order: 2,
      metadata: { trendData: getTrendData() }
    },
    {
      type: 'references' as const,
      content: '',
      order: 3,
      metadata: { sources }
    }
  ];

  const getSentimentStyle = () => {
    if (sentimentScore > 20) return {
      label: "Positive",
      gradient: "bg-gradient-to-br from-green-50 to-emerald-50",
      border: "border-green-200",
      pillBg: "bg-green-100",
      pillText: "text-green-700",
      pillBorder: "border-green-300"
    };
    if (sentimentScore < -20) return {
      label: "Negative",
      gradient: "bg-gradient-to-br from-red-50 to-rose-50",
      border: "border-red-200",
      pillBg: "bg-red-100",
      pillText: "text-red-700",
      pillBorder: "border-red-300"
    };
    return {
      label: "Neutral",
      gradient: "bg-gradient-to-br from-orange-50 to-amber-50",
      border: "border-orange-200",
      pillBg: "bg-orange-100",
      pillText: "text-orange-700",
      pillBorder: "border-orange-300"
    };
  };

  const renderSlideContent = (slide: SentimentSlide) => {
    const sentiment = getSentimentStyle();
    
    switch (slide.type) {
      case 'hero':
        return (
          <div className="flex flex-col justify-center items-center h-full space-y-6">
            {/* Keyword Pill */}
            <div className={`inline-flex items-center px-6 py-3 rounded-full ${sentiment.pillBg} border-2 ${sentiment.pillBorder}`}>
              <span className={`text-2xl font-bold ${sentiment.pillText}`}>
                {slide.content}
              </span>
            </div>
            
            {/* Sentiment Label */}
            <div className={`text-3xl font-semibold ${sentiment.pillText}`}>
              {sentiment.label}
            </div>
          </div>
        );

      case 'mention-count':
        const mentionCount = slide.metadata?.mentionCount || 0;
        return (
          <div className="flex flex-col justify-center items-center h-full space-y-4">
            <div className="text-sm text-muted-foreground">
              Mentions this week
            </div>
            <div className="text-7xl font-bold text-foreground">
              {mentionCount}
            </div>
          </div>
        );

      case 'trend-graph':
        const trendData = slide.metadata?.trendData || { currentCount: 0, previousCount: 0, change: 0, isIncrease: true, hasHistory: false };
        const maxCount = Math.max(trendData.currentCount, trendData.previousCount);
        const currentBarWidth = maxCount > 0 ? (trendData.currentCount / maxCount) * 100 : 0;
        const previousBarWidth = maxCount > 0 ? (trendData.previousCount / maxCount) * 100 : 0;
        
        return (
          <div className="flex flex-col justify-center h-full space-y-6 px-4">
            <div className="text-sm text-muted-foreground text-center">
              Count trend
            </div>
            
            {trendData.hasHistory ? (
              <>
                {/* Change indicator */}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl font-bold text-foreground">
                    {trendData.currentCount}
                  </span>
                  {trendData.isIncrease ? (
                    <ArrowUp className="h-8 w-8 text-green-600" />
                  ) : (
                    <ArrowDown className="h-8 w-8 text-red-600" />
                  )}
                  <span className={`text-2xl font-semibold ${trendData.isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                    {trendData.isIncrease ? '+' : '-'}{trendData.change}
                  </span>
                </div>
                
                {/* Simple bar graph */}
                <div className="space-y-3">
                  {/* This week */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>This week</span>
                      <span className="font-medium text-foreground">{trendData.currentCount}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-500"
                        style={{ width: `${currentBarWidth}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Last week */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Last week</span>
                      <span className="font-medium text-foreground">{trendData.previousCount}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                      <div 
                        className="bg-muted-foreground/40 h-full transition-all duration-500"
                        style={{ width: `${previousBarWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground">
                <div className="text-5xl font-bold text-foreground mb-2">
                  {trendData.currentCount}
                </div>
                <div className="text-sm">
                  First analysis
                </div>
              </div>
            )}
          </div>
        );
      
      case 'references':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <ExternalLink className="h-12 w-12 mx-auto text-primary/70" />
              <h3 className="text-lg font-semibold text-muted-foreground">Sources</h3>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {sources.slice(0, 4).map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-lg border hover:border-primary/30 hover:bg-muted/30 transition-all duration-200 text-left group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                        {source.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {source.date} {source.author && `• ${source.author}`}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </a>
              ))}
              {sources.length > 4 && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  +{sources.length - 4} more sources
                </div>
              )}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  // Create slide components for SwipeCarousel
  const slideComponents = displaySlides.map((slide, index) => (
    <div key={index} className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {renderSlideContent(slide)}
      </div>
    </div>
  ));

  const sentiment = getSentimentStyle();

  return (
    <div className="flex justify-center px-4">
      <Card className={`w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg hover-scale border-2 ${sentiment.border}`}>
        <div className={`relative h-[600px] flex flex-col overflow-hidden ${sentiment.gradient}`}>
          {/* Header */}
          <div className="flex items-center justify-end p-4 border-b border-border/50">
            {displaySlides.length > 1 && (
              <span className="text-sm text-muted-foreground">
                {currentSlide + 1} of {displaySlides.length}
              </span>
            )}
          </div>

          {/* SwipeCarousel */}
          <div className="flex-1">
            <SwipeCarousel
              slides={slideComponents}
              height="100%"
              initialIndex={currentSlide}
              showDots={false}
              onSlideChange={setCurrentSlide}
              ariaLabel="Sentiment analysis slides"
            />
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
    </div>
  );
};