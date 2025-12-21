import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, animate, PanInfo } from "framer-motion";
import { triggerHaptic } from "@/lib/deviceUtils";

export type SwipeCarouselProps = {
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

// Instagram-like easing curve - feels native and smooth
const SMOOTH_TRANSITION = {
  duration: 0.38,
  ease: [0.32, 0.72, 0, 1] as const,
};

const INSTANT_TRANSITION = { duration: 0 };

export function SwipeCarousel({
  slides,
  className = "",
  height = 360,
  initialIndex = 0,
  showDots = true,
  onSlideChange,
  ariaLabel = "Carousel",
  storyId,
  topicId,
  showPreviewAnimation = false,
  autoSlide = false,
  autoSlideInterval = 5000,
}: SwipeCarouselProps) {
  const count = slides.length;
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), count - 1));
  const [width, setWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hasTrackedSwipe = useRef(false);
  const previewAnimationRef = useRef<HTMLDivElement | null>(null);
  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => 
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  , []);
  
  const transition = prefersReducedMotion ? INSTANT_TRANSITION : SMOOTH_TRANSITION;

  // Measure width
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Notify parent of slide changes and track swipes
  useEffect(() => {
    onSlideChange?.(index);

    // Haptic feedback on slide change
    if (index > 0) {
      triggerHaptic('light');
    }

    // Track swipe interaction
    if (storyId && topicId && index > 0 && !hasTrackedSwipe.current) {
      hasTrackedSwipe.current = true;
      import('@/hooks/useStoryInteractionTracking').then(({ useStoryInteractionTracking }) => {
        const { trackSwipe } = useStoryInteractionTracking();
        trackSwipe(storyId, topicId, index);
      });
    }
  }, [index, onSlideChange, storyId, topicId]);

  // Preview animation effect
  useEffect(() => {
    if (!showPreviewAnimation || !previewAnimationRef.current) return;
    
    const element = previewAnimationRef.current;
    const sessionKey = topicId ? `swipe_preview_shown_${topicId}` : 'swipe_preview_shown_default';
    
    if (sessionStorage.getItem(sessionKey)) return;
    
    const timer = setTimeout(() => {
      const controls = animate(element, 
        { x: [0, -40, 0] }, 
        { duration: 1.8, ease: "easeInOut" }
      );
      
      setTimeout(() => {
        sessionStorage.setItem(sessionKey, 'true');
      }, 1800);
      
      return () => controls.stop();
    }, 800);
    
    return () => clearTimeout(timer);
  }, [showPreviewAnimation, topicId]);

  // Auto-slide effect
  useEffect(() => {
    if (!autoSlide || count <= 1) return;

    const interval = setInterval(() => {
      setIndex(current => current >= count - 1 ? 0 : current + 1);
    }, autoSlideInterval);

    return () => clearInterval(interval);
  }, [autoSlide, autoSlideInterval, count]);

  const clamp = useCallback((v: number) => Math.min(Math.max(v, 0), count - 1), [count]);

  // Navigate to specific slide
  const goTo = useCallback((i: number) => {
    setIndex(clamp(i));
  }, [clamp]);

  // Handle drag end - only updates index, animation is declarative
  const onDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    const distanceThreshold = width * 0.18;
    const flickVelocity = 650;

    let targetIndex = index;

    if (offset < -distanceThreshold || (velocity < -flickVelocity && offset < -10)) {
      targetIndex = Math.min(count - 1, index + 1);
    } else if (offset > distanceThreshold || (velocity > flickVelocity && offset > 10)) {
      targetIndex = Math.max(0, index - 1);
    }

    if (targetIndex !== index) setIndex(targetIndex);
  }, [count, index, width]);


  const heightStyle = useMemo(() => ({ 
    height: typeof height === "number" ? `${height}px` : height 
  }), [height]);

  if (count === 0) return null;

  // Calculate target x position based on current index
  const targetX = -index * width;

  return (
    <div 
      className={"relative select-none h-full " + className} 
      role="region" 
      aria-roledescription="carousel" 
      aria-label={ariaLabel} 
      style={heightStyle}
      ref={showPreviewAnimation ? previewAnimationRef : undefined}
    >
      <div 
        ref={viewportRef} 
        className="overflow-hidden w-full h-full" 
      >
        <motion.div
          className="flex h-full relative will-change-transform"
          // Declarative animation - framer handles everything
          animate={{ x: targetX }}
          transition={transition}
          // Drag configuration
          drag={width > 0 ? "x" : false}
          dragElastic={0.22}
          dragMomentum
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={onDragEnd}
          whileDrag={{ cursor: "grabbing" }}
          style={{ touchAction: "pan-y pinch-zoom" }}
        >
          {slides.map((slide, i) => {
            const isNear = Math.abs(i - index) <= 1;
            return (
              <div key={i} className="w-full shrink-0 grow-0 basis-full h-full">
                <div className="h-full w-full">{isNear ? slide : null}</div>
              </div>
            );
          })}
        </motion.div>
      </div>
      {showDots && count > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2.5 w-2.5 rounded-full transition-all p-[19px] -m-[19px] ${
                i === index ? "scale-110 bg-primary shadow" : "bg-muted-foreground/60 hover:bg-muted-foreground"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
