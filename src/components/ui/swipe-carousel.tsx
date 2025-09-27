import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, animate, useDragControls } from "framer-motion";

export type SwipeCarouselProps = {
  slides: React.ReactNode[];
  className?: string;
  height?: number | string;
  initialIndex?: number;
  showDots?: boolean;
  onSlideChange?: (index: number) => void;
  ariaLabel?: string;
  // Story tracking props
  storyId?: string;
  topicId?: string;
  // Enhanced animation props
  showPreviewAnimation?: boolean;
  // Limit drag start to centered area
  centerDragArea?: boolean;
};

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
  centerDragArea = false,
}: SwipeCarouselProps) {
  const count = slides.length;
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), count - 1));
  const [width, setWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const hasTrackedSwipe = useRef(false);
  const previewAnimationRef = useRef<HTMLDivElement | null>(null);
  const dragControls = useDragControls();

  // measure width
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

  // keep x aligned on resize (no animation)
  useEffect(() => {
    x.set(-index * width);
  }, [width]);

  // animate to index when changed via dots/click
  useEffect(() => {
    const controls = animate(x, -index * width, {
      type: "spring",
      stiffness: 520,
      damping: 46,
      mass: 0.9,
    });
    return controls.stop;
  }, [index]);

  // notify parent of slide changes and track swipes
  useEffect(() => {
    if (onSlideChange) {
      onSlideChange(index);
    }

    // Track swipe interaction if we have story/topic context and this is a real swipe
    if (storyId && topicId && index > 0 && !hasTrackedSwipe.current) {
      hasTrackedSwipe.current = true;
      // Dynamic import to avoid circular dependencies
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
    
    // Check if animation already shown in this session
    if (sessionStorage.getItem(sessionKey)) return;
    
    const timer = setTimeout(() => {
      const controls = animate(element, 
        { x: [-20, 0] }, 
        { 
          duration: 1.4,
          ease: "easeOut"
        }
      );
      
      // Mark as shown after animation completes
      setTimeout(() => {
        sessionStorage.setItem(sessionKey, 'true');
      }, 1400);
      
      return () => controls.stop();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [showPreviewAnimation, topicId]);

  const clamp = (v: number) => Math.min(Math.max(v, 0), count - 1);
  const goTo = (i: number) => setIndex(clamp(i));
  const prev = () => goTo(index - 1);
  const next = () => goTo(index + 1);

  // Instagram-like gesture: smooth slide-by-slide navigation
  const onDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const threshold = width * 0.25; // 25% of width to trigger slide change
    const swipeDistance = info.offset.x;
    const swipeVelocity = info.velocity.x;
    
    let targetIndex = index;
    
    // Determine direction based on distance and velocity
    if (swipeDistance > threshold || (swipeDistance > 50 && swipeVelocity > 500)) {
      // Swiped right (previous slide)
      targetIndex = Math.max(0, index - 1);
    } else if (swipeDistance < -threshold || (swipeDistance < -50 && swipeVelocity < -500)) {
      // Swiped left (next slide)
      targetIndex = Math.min(count - 1, index + 1);
    }
    
    // Animate to target slide
    const controls = animate(x, -targetIndex * width, {
      type: "spring",
      stiffness: 400,
      damping: 40,
      mass: 1,
    });
    setIndex(targetIndex);
    return () => controls.stop();
  };


  const heightStyle = useMemo(() => ({ height: typeof height === "number" ? `${height}px` : height }), [height]);

  if (count === 0) return null;

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
          className="flex h-full"
          drag={width > 0 ? "x" : false}
          dragElastic={0.12}
          dragMomentum
          dragConstraints={{ left: -(count - 1) * width, right: 0 }}
          dragTransition={{ power: 0.35, timeConstant: 260 }}
          whileDrag={{ cursor: "grabbing" }}
          style={{ x, touchAction: "pan-y" }}
          onDragEnd={onDragEnd}
          dragControls={dragControls}
          dragListener={!centerDragArea}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 grow-0 basis-full h-full">
              <div className="h-full w-full">{slide}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {centerDragArea && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            aria-label="Drag to navigate"
            className="pointer-events-auto h-[70%] w-[70%] cursor-grab"
            onPointerDown={(e) => dragControls.start(e)}
          />
        </div>
      )}

      {showDots && count > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i === index ? "scale-110 bg-primary shadow" : "bg-muted-foreground/60 hover:bg-muted-foreground"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}