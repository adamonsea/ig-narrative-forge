import { Card } from '@/components/ui/card';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { AutomatedInsightCard as InsightCardType } from '@/hooks/useAutomatedInsightCards';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Calendar, Users, Flame } from 'lucide-react';

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

  const getCardIcon = () => {
    switch (card.card_type) {
      case 'story_momentum':
        return <TrendingUp className="h-3.5 w-3.5" />;
      case 'this_time_last_month':
        return <Calendar className="h-3.5 w-3.5" />;
      case 'social_proof':
        return <Users className="h-3.5 w-3.5" />;
      case 'reading_streak':
        return <Flame className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  };

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
