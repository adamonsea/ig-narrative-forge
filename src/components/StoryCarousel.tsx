import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink, Heart, Share, Send } from "lucide-react";

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article: {
    source_url: string;
    region: string;
  };
}

interface StoryCarouselProps {
  story: Story;
  topicName: string;
}

export function StoryCarousel({ story, topicName }: StoryCarouselProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(Math.floor(Math.random() * 50) + 10); // Random initial count
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  const currentSlide = story.slides[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === story.slides.length - 1;

  const nextSlide = () => {
    if (!isLastSlide) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const prevSlide = () => {
    if (!isFirstSlide) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlideIndex(index);
  };

  const toggleLove = () => {
    setIsLoved(!isLoved);
    setLoveCount(prev => isLoved ? prev - 1 : prev + 1);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: story.title,
        text: currentSlide.content,
        url: story.article.source_url,
      });
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(`${story.title}\n\n${currentSlide.content}\n\nRead more: ${story.article.source_url}`);
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

    if (isLeftSwipe && !isLastSlide) {
      nextSlide();
    }
    if (isRightSwipe && !isFirstSlide) {
      prevSlide();
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Slide Content */}
      <div className="relative">
        <div 
          className="p-8"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Main Content */}
          <div className="mb-8">
            <p className={`leading-normal text-foreground ${
              isFirstSlide 
                ? "text-4xl font-bold uppercase" 
                : "text-3xl font-light"
            }`}>
              {currentSlide.content}
            </p>
          </div>

          {/* Last slide actions */}
          {isLastSlide && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="flex items-center gap-2"
              >
                <Share className="w-4 h-4" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </Button>
              <Button
                variant={isLoved ? "default" : "outline"}
                size="sm"
                onClick={toggleLove}
                className="flex items-center gap-2"
              >
                <Heart className={`w-4 h-4 ${isLoved ? "fill-current" : ""}`} />
                Like
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Controls - only show if more than 1 slide */}
        {story.slides.length > 1 && (
          <>
            {/* Navigation Buttons */}
            <div className="absolute right-4 top-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevSlide}
                disabled={isFirstSlide}
                className="bg-background/80 backdrop-blur"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextSlide}
                disabled={isLastSlide}
                className="bg-background/80 backdrop-blur"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Slide Progress - only show if more than 1 slide */}
      {story.slides.length > 1 && (
        <div className="px-8 pb-4">
          <div className="flex gap-1 mb-4">
            {story.slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  index === currentSlideIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground text-center">
            Slide {currentSlideIndex + 1} of {story.slides.length}
          </div>
        </div>
      )}

      {/* Bottom Attribution */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-t px-8 py-4 bg-muted/20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{topicName}</span>
            {story.publication_name && (
              <>
                <span>•</span>
                <span>{story.publication_name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLove}
              className="flex items-center gap-1 h-8 px-2 text-muted-foreground hover:text-primary"
            >
              <Heart className={`w-4 h-4 ${isLoved ? "fill-current text-red-500" : ""}`} />
              <span className="text-xs">{loveCount}</span>
            </Button>
          </div>
        </div>
        <a
          href={story.article.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-primary transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Source</span>
        </a>
      </div>
    </Card>
  );
}