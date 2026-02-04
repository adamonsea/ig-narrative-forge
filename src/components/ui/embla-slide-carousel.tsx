import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { triggerHaptic, getEmblaSettings } from "@/lib/deviceUtils";

export type EmblaSlideCarouselProps = {
  slides: React.ReactNode[];
  className?: string;
  height?: number | string;
  initialIndex?: number;
  showDots?: boolean;
  dotStyle?: "default" | "instagram";
  onSlideChange?: (index: number) => void;
  ariaLabel?: string;
  storyId?: string;
  topicId?: string;
  showPreviewAnimation?: boolean;
  autoSlide?: boolean;
  autoSlideInterval?: number;
  /** Optional image URLs for pre-decoding adjacent slides */
  slideImageUrls?: (string | null | undefined)[];
};

export function EmblaSlideCarousel({
  slides,
  className = "",
  height = 360,
  initialIndex = 0,
  showDots = true,
  dotStyle = "default",
  onSlideChange,
  ariaLabel = "Carousel",
  storyId,
  topicId,
  autoSlide = false,
  autoSlideInterval = 5000,
  slideImageUrls = [],
}: EmblaSlideCarouselProps) {
  const count = slides.length;
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(Math.max(0, initialIndex), count - 1)
  );
  const [isSettling, setIsSettling] = useState(false);
  const hasTrackedSwipe = useRef(false);

  // Get device-specific settings using centralized helper
  const emblaSettings = useMemo(() => getEmblaSettings(), []);

  // Pre-decode adjacent slide images for smoother transitions
  useEffect(() => {
    if (!emblaSettings.shouldPreDecodeImages || slideImageUrls.length === 0) return;

    const preDecodeImage = (url: string | null | undefined) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
      // Use decode() API if available for GPU-ready images
      if ('decode' in img) {
        img.decode().catch(() => {
          // Silent fail - image will still load normally
        });
      }
    };

    // Pre-decode next 2 slides
    const nextIndex = selectedIndex + 1;
    const nextNextIndex = selectedIndex + 2;
    
    if (nextIndex < slideImageUrls.length) {
      preDecodeImage(slideImageUrls[nextIndex]);
    }
    if (nextNextIndex < slideImageUrls.length) {
      preDecodeImage(slideImageUrls[nextNextIndex]);
    }
  }, [selectedIndex, slideImageUrls, emblaSettings.shouldPreDecodeImages]);

  // Embla with device-optimized settings for smoother animation
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    skipSnaps: false,
    startIndex: initialIndex,
    watchDrag: true,
    duration: emblaSettings.duration,
    dragThreshold: emblaSettings.dragThreshold,
    inViewThreshold: 0.7, // Better visibility detection
  });

  // Sync selected index with Embla
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const newIndex = emblaApi.selectedScrollSnap();
    setSelectedIndex(newIndex);
  }, [emblaApi]);

  // Handle settling state for smooth CSS transition
  const onSettle = useCallback(() => {
    setIsSettling(false);
  }, []);

  const onScroll = useCallback(() => {
    setIsSettling(true);
  }, []);

  // Setup Embla event listeners
  useEffect(() => {
    if (!emblaApi) return;

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("settle", onSettle);
    emblaApi.on("scroll", onScroll);

    // Set initial index
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
      emblaApi.off("settle", onSettle);
      emblaApi.off("scroll", onScroll);
    };
  }, [emblaApi, onSelect, onSettle, onScroll]);

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
        className={`overflow-hidden w-full h-full cursor-grab active:cursor-grabbing ${
          emblaSettings.useNativeScrollSnap ? 'embla-native-scroll' : ''
        }`}
        style={{
          touchAction: "pan-y pinch-zoom",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Embla container - GPU accelerated via CSS class */}
        <div 
          className={`flex h-full touch-pan-y embla-container-smooth ${
            emblaSettings.useGpuAcceleration ? 'embla-gpu-layer' : ''
          } ${isSettling ? 'is-settling' : ''}`}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="flex-[0_0_100%] min-w-0 h-full embla-slide-contained"
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
        dotStyle === "instagram" ? (
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 w-1.5 rounded-full pointer-events-auto ${
                  i === selectedIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/25"
                }`}
              />
            ))}
          </div>
        ) : (
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
        )
      )}
    </div>
  );
}
