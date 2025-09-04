import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Clock, ExternalLink, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { format, parseISO } from "date-fns";
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
  analysisDate,
  cardType,
  slides = []
}: SentimentCardProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  
  // Use slides if available, otherwise create from content
  const displaySlides = slides.length > 0 ? slides : [
    {
      type: 'hero' as const,
      content: content.headline,
      order: 0,
      metadata: { statistics: content.statistics, summary: content.summary }
    },
    ...(content.key_quote ? [{
      type: 'quote' as const,
      content: content.key_quote,
      order: 1,
      metadata: {}
    }] : []),
    {
      type: 'references' as const,
      content: `Based on ${sources.length} source${sources.length > 1 ? 's' : ''}`,
      order: slides.length > 0 ? slides.length - 1 : 2,
      metadata: { sources }
    }
  ];
  const getSentimentIcon = () => {
    if (sentimentScore > 20) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (sentimentScore < -20) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-yellow-600" />;
  };

  const getSentimentColor = () => {
    if (sentimentScore > 20) return "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200";
    if (sentimentScore < -20) return "bg-gradient-to-br from-red-50 to-rose-50 border-red-200";
    return "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200";
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % displaySlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + displaySlides.length) % displaySlides.length);
  };

  const renderSlideContent = (slide: SentimentSlide) => {
    switch (slide.type) {
      case 'hero':
        return (
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-foreground leading-tight">
              {slide.content}
            </h3>
            {slide.metadata?.statistics && (
              <p className="text-sm text-muted-foreground">
                {slide.metadata.statistics}
              </p>
            )}
            {slide.metadata?.summary && (
              <p className="text-sm text-foreground/90 leading-relaxed">
                {slide.metadata.summary}
              </p>
            )}
          </div>
        );
      
      case 'quote':
        return (
          <blockquote className="border-l-4 border-primary/30 pl-4 py-2">
            <p className="text-base italic text-foreground font-medium leading-relaxed">
              "{slide.content}"
            </p>
          </blockquote>
        );
      
      case 'statistic':
        return (
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-primary">
              {slide.content}
            </div>
            {slide.metadata?.description && (
              <p className="text-sm text-muted-foreground">
                {slide.metadata.description}
              </p>
            )}
          </div>
        );
      
      case 'references':
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              {slide.content}
            </p>
            {slide.metadata?.sources && (
              <div className="space-y-2">
                {slide.metadata.sources.slice(0, 3).map((source: any, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{source.title}</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      
      default:
        return <p className="text-sm text-foreground">{slide.content}</p>;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d');
    } catch {
      return 'Recent';
    }
  };

  return (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${getSentimentColor()}`}>
      {/* Distinct sentiment header with gradient */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-background/80 to-background/60 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Sentiment Analysis
          </span>
          {getSentimentIcon()}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(analysisDate)}
        </div>
      </div>

      {/* Carousel content area */}
      <div className="relative min-h-[200px] p-4">
        <div className="transition-all duration-300 ease-in-out">
          {renderSlideContent(displaySlides[currentSlide])}
        </div>

        {/* Navigation buttons - only show if multiple slides */}
        {displaySlides.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={prevSlide}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextSlide}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Bottom section with keyword and pagination dots */}
      <div className="px-4 py-3 bg-background/50 border-t border-border/30">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs px-2 py-1 bg-primary/5">
            {keywordPhrase}
          </Badge>
          
          {/* Pagination dots - only show if multiple slides */}
          {displaySlides.length > 1 && (
            <div className="flex items-center gap-1">
              {displaySlides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
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