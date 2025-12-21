import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { triggerHaptic } from "@/lib/deviceUtils";

export type EmblaSlideCarouselProps = {
  slides: React.ReactNode[];
  className?: string;
  height?: number | string;
  initialIndex?: number;
  showDots?: boolean;
  onSlideChange?: (index: number) => void;
  ariaLabel?: string;
  storyId?: string;
  topicId?: string;
  showPreviewAnimation?: boolean;
  autoSlide?: boolean;
  autoSlideInterval?: number;
};

export function EmblaSlideCarousel({
  slides,
  className = "",
  height = 360,
  initialIndex = 0,
  showDots = true,
  onSlideChange,
  ariaLabel = "Carousel",
  storyId,
  topicId,
  autoSlide = false,
  autoSlideInterval = 5000,
}: EmblaSlideCarouselProps) {
  const count = slides.length;
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(Math.max(0, initialIndex), count - 1)
  );
  const hasTrackedSwipe = useRef(false);

  // Embla with mobile-optimized options
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false, // Snap to slides
    skipSnaps: false, // Never skip slides
    startIndex: initialIndex,
    watchDrag: true,
    duration: 25, // Snappy but smooth (lower = faster)
  });

  // Sync selected index with Embla
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const newIndex = emblaApi.selectedScrollSnap();
    setSelectedIndex(newIndex);
  }, [emblaApi]);

  // Setup Embla event listeners
  useEffect(() => {
    if (!emblaApi) return;

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);

    // Set initial index
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Notify parent of slide changes
  useEffect(() => {
    onSlideChange?.(selectedIndex);

    // Haptic feedback on slide change
    if (selectedIndex > 0) {
      triggerHaptic("light");
    }

    // Track swipe interaction
    if (storyId && topicId && selectedIndex > 0 && !hasTrackedSwipe.current) {
      hasTrackedSwipe.current = true;
      import("@/hooks/useStoryInteractionTracking").then(({ useStoryInteractionTracking }) => {
        const { trackSwipe } = useStoryInteractionTracking();
        trackSwipe(storyId, topicId, selectedIndex);
      });
    }
  }, [selectedIndex, onSlideChange, storyId, topicId]);

  // Auto-slide effect
  useEffect(() => {
    if (!autoSlide || !emblaApi || count <= 1) return;

    const interval = setInterval(() => {
      if (emblaApi.canScrollNext()) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollTo(0);
      }
    }, autoSlideInterval);

    return () => clearInterval(interval);
  }, [autoSlide, autoSlideInterval, emblaApi, count]);

  // Navigate to specific slide
  const goTo = useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index);
    },
    [emblaApi]
  );

  const heightStyle =
    typeof height === "number" ? { height: `${height}px` } : { height };

  if (count === 0) return null;

  return (
    <div
      className={`relative select-none ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      style={heightStyle}
    >
      {/* Embla viewport */}
      <div
        ref={emblaRef}
        className="overflow-hidden w-full h-full"
        style={{
          // iOS-specific touch optimizations
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y pinch-zoom",
        }}
      >
        {/* Embla container */}
        <div
          className="flex h-full"
          style={{
            // GPU acceleration
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="flex-[0_0_100%] min-w-0 h-full"
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${count}`}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {/* Dot navigation */}
      {showDots && count > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2.5 w-2.5 rounded-full transition-all duration-200 p-[19px] -m-[19px] ${
                i === selectedIndex
                  ? "scale-110 bg-primary shadow"
                  : "bg-muted-foreground/60 hover:bg-muted-foreground"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
