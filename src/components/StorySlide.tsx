interface Slide {
  id: string;
  slide_number: number;
  content: string;
  alt_text: string | null;
  visual_prompt: string | null;
  visuals: Array<{
    image_url: string | null;
    alt_text: string | null;
  }>;
}

interface StorySlideProps {
  slide: Slide;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function StorySlide({ slide, onNext, onPrev, canGoNext, canGoPrev }: StorySlideProps) {
  const hasVisual = slide.visuals && slide.visuals.length > 0 && slide.visuals[0]?.image_url;

  return (
    <div className="relative min-h-[400px] bg-background">
      {/* Visual Area */}
      {hasVisual ? (
        <div className="aspect-video bg-muted/50 border-b flex items-center justify-center">
          <img
            src={slide.visuals[0].image_url!}
            alt={slide.visuals[0].alt_text || slide.alt_text || "Story visual"}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-muted/30 to-muted/60 border-b flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            {slide.visual_prompt ? (
              <div className="max-w-md px-4">
                <p className="text-sm opacity-75 mb-2">Visual concept:</p>
                <p className="text-xs italic">{slide.visual_prompt}</p>
              </div>
            ) : (
              <p className="text-sm">Visual pending</p>
            )}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="p-6">
        <div className="prose prose-lg max-w-none">
          <p className="text-foreground leading-relaxed text-lg font-light">
            {slide.content}
          </p>
        </div>
      </div>

      {/* Touch/Click Areas for Navigation */}
      {canGoPrev && (
        <button
          onClick={onPrev}
          className="absolute left-0 top-0 w-1/3 h-full bg-transparent hover:bg-black/5 transition-colors z-10"
          aria-label="Previous slide"
        />
      )}
      
      {canGoNext && (
        <button
          onClick={onNext}
          className="absolute right-0 top-0 w-1/3 h-full bg-transparent hover:bg-black/5 transition-colors z-10"
          aria-label="Next slide"
        />
      )}
    </div>
  );
}