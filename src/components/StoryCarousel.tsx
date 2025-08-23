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
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  
  const currentSlide = story.slides[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === story.slides.length - 1;

  const nextSlide = () => {
    if (!isLastSlide) {
      setSlideDirection('left');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex + 1);
        setSlideDirection(null);
      }, 150);
    }
  };

  const prevSlide = () => {
    if (!isFirstSlide) {
      setSlideDirection('right');
      setTimeout(() => {
        setCurrentSlideIndex(currentSlideIndex - 1);
        setSlideDirection(null);
      }, 150);
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
          <div className={`mb-8 transition-all duration-300 ${
            slideDirection === 'left' ? 'animate-slide-out-left' : 
            slideDirection === 'right' ? 'animate-slide-out-right' : 
            'animate-fade-in'
          }`}>
            <p className={`leading-normal text-foreground ${
              isFirstSlide 
                ? "text-4xl font-bold uppercase" 
                : "text-3xl font-light"
            }`}>
              {currentSlide.content}
            </p>
          </div>

          {/* Last slide actions and attribution */}
          {isLastSlide && (
            <>
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
              
              <div className="text-sm text-muted-foreground border-t pt-4 mt-4">
                <p className="mb-2">
                  Comment, like, share. Summarised by{" "}
                  {story.author && story.publication_name 
                    ? `${story.author} from ${story.publication_name}` 
                    : story.publication_name || "our editorial team"
                  }.
                </p>
                <p>
                  Support local journalism, visit their{" "}
                  <a 
                    href={story.article.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    source website
                  </a>
                  {" "}for the full story.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Navigation Controls removed per user request */}
      </div>

      {/* Slide Progress - only show if more than 1 slide */}
      {story.slides.length > 1 && (
        <div className="px-8 pb-4">
          <div className="flex justify-center gap-2 mb-4">
            {story.slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
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

      {/* Bottom Attribution - no source link on non-last slides */}
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
      </div>
    </Card>
  );
}