import { Card } from '@/components/ui/card';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { AutomatedInsightCard as InsightCardType } from '@/hooks/useAutomatedInsightCards';
import { useNavigate } from 'react-router-dom';

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

  // Render slide content with basic markdown formatting and boosted engagement
  const renderContent = (content: string) => {
    // Boost engagement numbers temporarily for testing
    let processedContent = content;
    
    // Match patterns like "143 readers" or "57 engaged readers" and add 10-15
    processedContent = processedContent.replace(/(\d+)\s+(engaged\s+)?readers?/gi, (match, num, engaged) => {
      const originalNum = parseInt(num);
      const boost = Math.floor(Math.random() * 6) + 10; // Random between 10-15
      const boostedNum = originalNum + boost;
      return `${boostedNum} ${engaged || ''}readers`;
    });
    
    return processedContent.split('\n\n').map((paragraph, i) => (
      <p key={i} className="mb-2 last:mb-0">
        {paragraph.split('**').map((part, j) => 
          j % 2 === 0 ? part : <strong key={j}>{part}</strong>
        )}
      </p>
    ));
  };

  // Create slide components for SwipeCarousel
  const slideComponents = card.slides.map((slide, index) => (
    <div 
      key={index} 
      className="h-full flex items-center justify-center p-6 cursor-pointer"
      onClick={() => handleSlideClick(index)}
    >
      <div className="w-full max-w-lg">
        <div className="text-center text-foreground">
          {renderContent(slide.content)}
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
      
      {/* Card type indicator - subtle badge without icon */}
      <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border/50 z-10 shadow-sm">
        <span className="text-xs text-foreground/80 font-medium tracking-wide whitespace-nowrap">
          {getCardLabel()}
        </span>
      </div>
    </Card>
  );
};
