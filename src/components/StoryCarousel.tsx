import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

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

  return (
    <Card className="overflow-hidden">
      {/* Slide Content */}
      <div className="relative">
        <div className="p-8">
          {/* Main Content */}
          <div className="mb-8">
            <p className="text-2xl leading-relaxed font-light text-foreground">
              {currentSlide.content}
            </p>
          </div>
        </div>

        {/* Navigation Controls - only show if more than 1 slide */}
        {story.slides.length > 1 && (
          <>
            {/* Touch/Click Areas for Navigation */}
            {!isFirstSlide && (
              <button
                onClick={prevSlide}
                className="absolute left-0 top-0 w-1/3 h-full bg-transparent hover:bg-black/5 transition-colors z-10"
                aria-label="Previous slide"
              />
            )}
            
            {!isLastSlide && (
              <button
                onClick={nextSlide}
                className="absolute right-0 top-0 w-1/3 h-full bg-transparent hover:bg-black/5 transition-colors z-10"
                aria-label="Next slide"
              />
            )}

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
        <div className="flex items-center gap-2">
          <span className="font-medium">{topicName}</span>
          {story.publication_name && (
            <>
              <span>•</span>
              <span>{story.publication_name}</span>
            </>
          )}
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