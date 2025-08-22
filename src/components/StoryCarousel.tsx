import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StorySlide } from "./StorySlide";

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
    alt_text: string | null;
    visual_prompt: string | null;
    visuals: Array<{
      image_url: string | null;
      alt_text: string | null;
    }>;
  }>;
  article: {
    source_url: string;
    region: string;
  };
}

interface StoryCarouselProps {
  stories: Story[];
}

export function StoryCarousel({ stories }: StoryCarouselProps) {
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  if (stories.length === 0) return null;

  const currentStory = stories[currentStoryIndex];
  const currentSlide = currentStory.slides[currentSlideIndex];

  const nextStory = () => {
    if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
      setCurrentSlideIndex(0);
    }
  };

  const prevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
      setCurrentSlideIndex(0);
    }
  };

  const nextSlide = () => {
    if (currentSlideIndex < currentStory.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    } else {
      nextStory();
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    } else if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
      setCurrentSlideIndex(stories[currentStoryIndex - 1].slides.length - 1);
    }
  };

  const goToStory = (storyIndex: number) => {
    setCurrentStoryIndex(storyIndex);
    setCurrentSlideIndex(0);
  };

  const goToSlide = (slideIndex: number) => {
    setCurrentSlideIndex(slideIndex);
  };

  return (
    <div className="space-y-6">
      {/* Story Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={prevStory}
            disabled={currentStoryIndex === 0}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous Story
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            {currentStoryIndex + 1} of {stories.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={nextStory}
            disabled={currentStoryIndex === stories.length - 1}
          >
            Next Story
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Story Progress Dots */}
      <div className="flex justify-center gap-2">
        {stories.slice(Math.max(0, currentStoryIndex - 2), currentStoryIndex + 3).map((_, index) => {
          const actualIndex = Math.max(0, currentStoryIndex - 2) + index;
          return (
            <button
              key={actualIndex}
              onClick={() => goToStory(actualIndex)}
              className={`w-2 h-2 rounded-full transition-colors ${
                actualIndex === currentStoryIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          );
        })}
      </div>

      {/* Main Story Card */}
      <Card className="overflow-hidden">
        {/* Story Header */}
        <div className="p-4 border-b bg-muted/50">
          <h2 className="text-lg font-semibold leading-tight mb-2">
            {currentStory.title}
          </h2>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {currentStory.publication_name && (
                <span>{currentStory.publication_name}</span>
              )}
              {currentStory.author && (
                <span>• by {currentStory.author}</span>
              )}
            </div>
            <span>
              {new Date(currentStory.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Slide Content */}
        <StorySlide
          slide={currentSlide}
          onNext={nextSlide}
          onPrev={prevSlide}
          canGoNext={currentSlideIndex < currentStory.slides.length - 1 || currentStoryIndex < stories.length - 1}
          canGoPrev={currentSlideIndex > 0 || currentStoryIndex > 0}
        />

        {/* Slide Navigation */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              Slide {currentSlideIndex + 1} of {currentStory.slides.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevSlide}
                disabled={currentSlideIndex === 0 && currentStoryIndex === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextSlide}
                disabled={currentSlideIndex === currentStory.slides.length - 1 && currentStoryIndex === stories.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Slide Progress */}
          <div className="flex gap-1">
            {currentStory.slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  index === currentSlideIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Source Attribution */}
        <div className="p-3 bg-muted/20 text-xs text-muted-foreground">
          <a
            href={currentStory.article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Read original article →
          </a>
        </div>
      </Card>
    </div>
  );
}