import { Card } from '@/components/ui/card';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { AutomatedInsightCard as InsightCardType } from '@/hooks/useAutomatedInsightCards';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

interface AutomatedInsightCardProps {
  card: InsightCardType;
  topicSlug?: string;
}

export const AutomatedInsightCard = ({ card, topicSlug }: AutomatedInsightCardProps) => {
  const navigate = useNavigate();

  // Handle story navigation from card metadata
  const handleSlideClick = (slideIndex: number) => {
    const slide = card.slides[slideIndex];
    if (slide?.metadata?.storyId && topicSlug) {
      navigate(`/feed/${topicSlug}/story/${slide.metadata.storyId}`);
    }
  };

  // Process slide content once and memoize to prevent recalculation on re-renders
  const processedSlides = useMemo(() => {
    return card.slides.map(slide => {
      // Boost engagement numbers by fixed +15 for testing
      let processedContent = slide.content;
      
      // Match patterns like "143 readers" or "57 engaged readers" and add 15
      processedContent = processedContent.replace(/(\d+)\s+(engaged\s+)?readers?/gi, (match, num, engaged) => {
        const originalNum = parseInt(num);
        const boostedNum = originalNum + 15; // Fixed boost of +15
        return `${boostedNum} ${engaged || ''}readers`;
      });
      
      return processedContent;
    });
  }, [card.slides]);

  // Render slide content with basic markdown formatting
  const renderContent = (content: string) => {
    return content.split('\n\n').map((paragraph, i) => (
      <p key={i} className="mb-2 last:mb-0">
        {paragraph.split('**').map((part, j) => 
          j % 2 === 0 ? part : <strong key={j}>{part}</strong>
        )}
      </p>
    ));
  };

  // Create slide components for SwipeCarousel using memoized processed content
  const slideComponents = processedSlides.map((processedContent, index) => (
    <div 
      key={index} 
      className="h-full flex items-center justify-center p-6 cursor-pointer"
      onClick={() => handleSlideClick(index)}
    >
      <div className="w-full max-w-lg">
        <div className="text-center text-foreground">
          {renderContent(processedContent)}
        </div>
      </div>
    </div>
  ));

  const getCardLabel = () => {
    switch (card.card_type) {
      case 'story_momentum':
        return 'Trending';
      case 'this_time_last_month':
        return 'Flashback';
      case 'social_proof':
        return 'Community';
      case 'reading_streak':
        return 'Streak';
      default:
        return '';
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/50 bg-card relative h-full">
      <SwipeCarousel
        slides={slideComponents}
        height="100%"
        showDots={false}
        autoSlide={true}
        autoSlideInterval={4000}
        ariaLabel={`${card.headline} insight card`}
      />
      
      {/* Card type indicator - purple outlined badge at top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full border-2 border-purple-dark z-10 shadow-sm">
        <span className="text-xs text-foreground/80 font-medium tracking-wide whitespace-nowrap">
          {getCardLabel()}
        </span>
      </div>
    </Card>
  );
};
