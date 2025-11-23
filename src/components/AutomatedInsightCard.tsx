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
    if (slide?.metadata?.storySlug && topicSlug) {
      navigate(`/topic/${topicSlug}/story/${slide.metadata.storySlug}`);
    }
  };

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

  return (
    <Card className="insight-card overflow-hidden border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 relative">
      <SwipeCarousel
        slides={slideComponents}
        height="100%"
        showDots={false}
        ariaLabel={`${card.headline} insight card`}
      />
      
      {/* Card type indicator */}
      <div className="absolute top-2 right-2 bg-primary/10 backdrop-blur-sm px-2 py-1 rounded-full z-10">
        <span className="text-xs text-primary font-medium">
          {card.card_type === 'story_momentum' && '📈 Trending'}
          {card.card_type === 'this_time_last_month' && '📅 Flashback'}
          {card.card_type === 'social_proof' && '👥 Community'}
          {card.card_type === 'reading_streak' && '🔥 Streak'}
        </span>
      </div>
    </Card>
  );
};
