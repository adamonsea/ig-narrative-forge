import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import arrowRightSvg from '@/assets/arrow-right.svg';
import { motion } from 'framer-motion';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { createSafeHTML, sanitizeContentWithLinks } from '@/lib/sanitizer';
import { Link } from 'react-router-dom';

interface RoundupCarouselProps {
  roundup: {
    id: string;
    slide_data: any[];
    stats: any;
  };
  topicId: string;
  topicName: string;
  topicSlug: string;
  roundupType: 'daily' | 'weekly';
}

export default function RoundupCarousel({ 
  roundup, 
  topicId, 
  topicName, 
  topicSlug,
  roundupType 
}: RoundupCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  
  const slides = roundup.slide_data || [];
  const isLastSlide = currentSlideIndex === slides.length - 1;

  const nextSlide = () => {
    if (!isLastSlide) {
      setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1));
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlideIndex(Math.max(0, Math.min(index, slides.length - 1)));
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/feed/${topicSlug}/${roundupType}/${roundup.id}`;
    const shareText = roundupType === 'daily' 
      ? `Today in ${topicName} - ${roundup.stats?.story_count || 0} stories`
      : `This week in ${topicName} - ${roundup.stats?.story_count || 0} stories`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        import('@/components/ui/use-toast').then(({ toast }) => {
          toast({
            title: "Link copied!",
            description: "Roundup link has been copied to your clipboard.",
          });
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  };

  const getTextSize = (content: string) => {
    const length = content.length;
    if (length < 80) return "text-4xl md:text-5xl lg:text-6xl";
    if (length < 150) return "text-3xl md:text-4xl lg:text-5xl";
    if (length < 250) return "text-2xl md:text-3xl lg:text-4xl";
    return "text-xl md:text-2xl lg:text-3xl";
  };

  const slideComponents = slides.map((slide, index) => {
    const isHero = slide.type === 'hero';
    const isOutro = slide.type === 'outro';
    const isStoryPreview = slide.type === 'story_preview';

    return (
      <div key={index} className="h-full w-full">
        <div className="h-full flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-lg mx-auto text-center">
            <div className={`leading-relaxed ${
              isHero 
                ? 'text-5xl md:text-6xl lg:text-7xl font-bold uppercase' 
                : getTextSize(slide.content)
            } ${isHero ? 'font-bold' : 'font-light'} text-balance`}>
              <div dangerouslySetInnerHTML={createSafeHTML(
                sanitizeContentWithLinks(slide.content),
                true
              )} />
              
              {isStoryPreview && slide.story_id && (
                <div className="mt-6">
                  <Button asChild variant="outline" size="lg">
                    <Link to={`/feed/${topicSlug}/story/${slide.story_id}`}>
                      Read Full Story
                    </Link>
                  </Button>
                </div>
              )}

              {isOutro && (
                <div className="mt-6">
                  <Button asChild variant="default" size="lg">
                    <Link to={`/feed/${topicSlug}`}>
                      {roundupType === 'daily' ? 'More Stories' : 'Browse All Stories'}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
            
            {!isLastSlide && slides.length > 1 && (
              <div className="flex justify-center mt-8">
                <motion.div
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="cursor-pointer"
                  onClick={nextSlide}
                >
                  <img 
                    src={arrowRightSvg} 
                    alt="Next slide" 
                    className="w-[125px] h-[28px]"
                  />
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

  if (slides.length === 0) {
    return (
      <div className="flex justify-center px-4">
        <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg overflow-hidden shadow-lg">
          <div className="p-6 text-center text-muted-foreground">
            <p>Roundup content is not available</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center px-1 md:px-4">
      <Card 
        className="w-full max-w-sm md:max-w-md lg:max-w-lg overflow-hidden shadow-lg relative"
        data-roundup-card
        data-roundup-id={roundup.id}
      >
        <SwipeCarousel
          slides={slideComponents}
          initialIndex={currentSlideIndex}
          onSlideChange={goToSlide}
        />

        {/* Slide Counter */}
        <div className="absolute top-4 right-4 bg-background/80 backdrop-blur px-3 py-1 rounded-full text-sm font-medium">
          {currentSlideIndex + 1} / {slides.length}
        </div>

        {/* Share Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleShare}
          className="absolute bottom-4 right-4 bg-background/80 backdrop-blur hover:bg-background/90"
          aria-label="Share roundup"
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </Card>
    </div>
  );
}
