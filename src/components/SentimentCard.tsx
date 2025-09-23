import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, MessageSquare, BarChart3, Quote, ExternalLink } from "lucide-react";
import { useState } from "react";

interface SentimentSlide {
  type: 'hero' | 'mention-count' | 'sentiment-score' | 'confidence-score' | 'forum-insight' | 'quote' | 'references';
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
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);
  
  // Parse external sentiment for Reddit data
  const parseExternalSentiment = () => {
    if (!content.external_sentiment) return null;
    
    const text = content.external_sentiment;
    const redditMatch = text.match(/Reddit.*?(\d+)%\s*(positive|negative|neutral)/i);
    const quoteMatch = text.match(/"([^"]+)"/);
    
    return {
      platform: redditMatch ? 'Reddit' : 'Forum',
      percentage: redditMatch ? parseInt(redditMatch[1]) : null,
      sentiment: redditMatch ? redditMatch[2] : null,
      quote: quoteMatch ? quoteMatch[1] : null
    };
  };

  const externalData = parseExternalSentiment();

  // Extract mention count from statistics
  const getMentionCount = () => {
    if (!content.statistics) return sources.length;
    const match = content.statistics.match(/(\d+)\s*(mention|article|report|story)/i);
    return match ? parseInt(match[1]) : sources.length;
  };

  // Create enhanced sentiment slides
  const displaySlides = [
    {
      type: 'hero' as const,
      content: keywordPhrase,
      order: 0,
      metadata: { sentimentScore, sourceCount: sources.length }
    },
    {
      type: 'mention-count' as const,
      content: '',
      order: 1,
      metadata: { mentionCount: getMentionCount(), timeframe: 'week' }
    },
    {
      type: 'sentiment-score' as const,
      content: '',
      order: 2,
      metadata: { sentimentScore }
    },
    {
      type: 'confidence-score' as const,
      content: '',
      order: 3,
      metadata: { confidenceScore }
    },
    ...(externalData?.quote ? [{
      type: 'forum-insight' as const,
      content: externalData.quote,
      order: 4,
      metadata: { platform: externalData.platform, percentage: externalData.percentage }
    }] : []),
    // Only include quote slide if there's a meaningful quote (not "No quote available" etc.)
    ...(content.key_quote && 
        !content.key_quote.toLowerCase().includes('no quote') &&
        !content.key_quote.toLowerCase().includes('not available') &&
        content.key_quote.trim().length > 10 ? [{
      type: 'quote' as const,
      content: content.key_quote,
      order: 5
    }] : []),
    {
      type: 'references' as const,
      content: '',
      order: 6,
      metadata: { sources }
    }
  ];
  const getSentimentBadge = () => {
    if (sentimentScore > 20) return { icon: <TrendingUp className="h-3 w-3" />, variant: "secondary" as const };
    if (sentimentScore < -20) return { icon: <TrendingDown className="h-3 w-3" />, variant: "destructive" as const };
    return { icon: <Minus className="h-3 w-3" />, variant: "outline" as const };
  };

  const nextSlide = () => {
    if (currentSlide < displaySlides.length - 1) {
      setSlideDirection('next');
      setCurrentSlide(currentSlide + 1);
      setTimeout(() => setSlideDirection(null), 300);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setSlideDirection('prev');
      setCurrentSlide(currentSlide - 1);
      setTimeout(() => setSlideDirection(null), 300);
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

  const getSentimentTemperature = () => {
    const normalized = Math.max(-100, Math.min(100, sentimentScore));
    const percentage = ((normalized + 100) / 2);
    
    // Temperature system: Freezing -> Chilly -> Tepid -> Warm -> Hot
    if (normalized >= 60) return { 
      gradient: "from-red-500 to-orange-600", 
      bgClass: "bg-gradient-to-br from-red-50 to-orange-50 border-red-200",
      barColor: "bg-gradient-to-r from-red-500 to-orange-600",
      width: percentage,
      label: "Very Positive",
      emoji: "🔥",
      description: "Hot"
    };
    if (normalized >= 20) return { 
      gradient: "from-orange-500 to-yellow-600", 
      bgClass: "bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200",
      barColor: "bg-gradient-to-r from-orange-500 to-yellow-600",
      width: percentage,
      label: "Positive",
      emoji: "🌡️",
      description: "Warm"
    };
    if (normalized >= -20) return { 
      gradient: "from-slate-400 to-slate-500", 
      bgClass: "bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200",
      barColor: "bg-gradient-to-r from-slate-400 to-slate-500",
      width: percentage,
      label: "Neutral",
      emoji: "⚪",
      description: "Tepid"
    };
    if (normalized >= -60) return { 
      gradient: "from-blue-500 to-cyan-600", 
      bgClass: "bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200",
      barColor: "bg-gradient-to-r from-blue-500 to-cyan-600",
      width: percentage,
      label: "Negative",
      emoji: "❄️",
      description: "Chilly"
    };
    return { 
      gradient: "from-cyan-600 to-blue-700", 
      bgClass: "bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200",
      barColor: "bg-gradient-to-r from-cyan-600 to-blue-700",
      width: percentage,
      label: "Very Negative",
      emoji: "🧊",
      description: "Freezing"
    };
  };

  const renderSlideContent = (slide: SentimentSlide) => {
    const temperature = getSentimentTemperature();
    
    switch (slide.type) {
      case 'hero':
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6">
              {/* Temperature Emoji & Keyword */}
              <div className="text-center space-y-4">
                <div className="text-6xl mb-2">
                  {temperature.emoji}
                </div>
                <div className="space-y-3">
                  {/* Keyword as tablet/badge */}
                  <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-lg font-semibold text-primary">
                      {slide.content}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50">
                    <span className="text-2xl">{temperature.emoji}</span>
                    <div className="w-16 h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${temperature.barColor} transition-all duration-500`}
                        style={{ width: `${Math.abs(sentimentScore)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Attribution at bottom */}
            <div className="text-center text-xs text-muted-foreground">
              Based on {sources.length} source{sources.length > 1 ? 's' : ''} • Last week
            </div>
          </div>
        );

      case 'mention-count':
        const mentionCount = slide.metadata?.mentionCount || 0;
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6 text-center">
              <div className="space-y-2">
                <TrendingUp className="h-12 w-12 mx-auto text-primary/70" />
                <h3 className="text-lg font-semibold text-muted-foreground">Discussion Volume</h3>
              </div>
              <div className="space-y-1">
                <div className="text-5xl md:text-6xl font-bold text-foreground">
                  {mentionCount}
                </div>
                <div className="text-sm text-muted-foreground">
                  mentions this {slide.metadata?.timeframe || 'week'}
                </div>
              </div>
              <div className="text-base text-muted-foreground">
                {mentionCount > 10 ? 'High activity' : mentionCount > 5 ? 'Moderate activity' : 'Low activity'}
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              Discussion intensity over past week
            </div>
          </div>
        );

      case 'sentiment-score':
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6 text-center">
              <div className="space-y-2">
                <BarChart3 className="h-12 w-12 mx-auto text-primary/70" />
                <h3 className="text-lg font-semibold text-muted-foreground">Overall Sentiment</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-4xl md:text-5xl font-bold text-foreground">
                    {sentimentScore > 0 ? '+' : ''}{sentimentScore}
                  </div>
                  <div className="text-sm text-muted-foreground">community sentiment</div>
                </div>
                <div className="w-20 h-3 bg-muted rounded-full overflow-hidden mx-auto">
                  <div 
                    className={`h-full ${temperature.barColor} transition-all duration-500`}
                    style={{ width: `${Math.abs(sentimentScore)}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              Sentiment range: -100 (very negative) to +100 (very positive)
            </div>
          </div>
        );
        
      case 'confidence-score':
        const confidence = slide.metadata?.confidenceScore || 0;
        return (
          <div className="flex flex-col justify-between h-full">
            <div className="flex-1 flex flex-col justify-center space-y-6 text-center">
              <div className="space-y-2">
                <div className="text-4xl mx-auto">🎯</div>
                <h3 className="text-lg font-semibold text-muted-foreground">Analysis Reliability</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-4xl md:text-5xl font-bold text-foreground">
                    {confidence}%
                  </div>
                  <div className="text-sm text-muted-foreground">confidence level</div>
                </div>
                <Progress value={confidence} className="h-3" />
              </div>
            </div>
            
            <div className="text-center text-xs text-muted-foreground">
              How reliable this sentiment analysis is based on source quality
            </div>
          </div>
        );

      case 'forum-insight':
        const platform = slide.metadata?.platform || 'Forum';
        const percentage = slide.metadata?.percentage;
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <MessageSquare className="h-12 w-12 mx-auto text-primary/70" />
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-semibold text-muted-foreground">Public Opinion</h3>
                <Badge variant="outline" className="text-xs">
                  {platform}
                </Badge>
              </div>
            </div>
            <div className="space-y-4">
              <blockquote className="text-lg md:text-xl italic text-balance leading-relaxed border-l-4 border-primary/30 pl-4">
                "{slide.content}"
              </blockquote>
              {percentage && (
                <div className="text-sm text-muted-foreground">
                  {percentage}% of discussions show similar sentiment
                </div>
              )}
            </div>
          </div>
        );
      
      case 'quote':
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <Quote className="h-12 w-12 mx-auto text-primary/70" />
              <h3 className="text-lg font-semibold text-muted-foreground">Key Quote</h3>
            </div>
            <blockquote className={`leading-relaxed italic text-balance border-l-4 border-primary/30 pl-4 ${getTextSize(slide.content, false)}`}>
              "{slide.content}"
            </blockquote>
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
        return (
          <div className={`text-center leading-relaxed ${getTextSize(slide.content, false)} text-balance`}>
            {slide.content}
          </div>
        );
    }
  };

  const sentimentBadge = getSentimentBadge();

  const temperature = getSentimentTemperature();

  return (
    <div className="flex justify-center px-4">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl overflow-hidden shadow-lg hover-scale">
        <div 
          className={`relative h-[600px] flex flex-col overflow-hidden ${temperature.bgClass}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <Badge variant={sentimentBadge.variant} className="text-sm font-medium flex items-center gap-1">
              {sentimentBadge.icon}
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
            
            <div className="p-6 md:p-8 w-full max-w-lg mx-auto h-full">
              <div 
                className={`transition-transform duration-300 ease-in-out h-full ${
                  slideDirection === 'next' ? 'transform translate-x-[-100%] opacity-0' : 
                  slideDirection === 'prev' ? 'transform translate-x-[100%] opacity-0' : 
                  'transform translate-x-0 opacity-100'
                }`}
                style={{
                  transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'
                }}
              >
                {renderSlideContent(displaySlides[currentSlide])}
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="p-4">
            {/* Progress dots with temperature theming */}
            {displaySlides.length > 1 && (
              <div className="flex justify-center space-x-2">
                {displaySlides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentSlide 
                        ? `${temperature.barColor} scale-125` 
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