import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useDeviceOptimizations, getAnimationPresets, triggerHaptic } from "@/lib/deviceUtils";

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
  // Auto-slide props
  autoSlide?: boolean;
  autoSlideInterval?: number; // milliseconds
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
  autoSlide = false,
  autoSlideInterval = 5000,
}: SwipeCarouselProps) {
  const count = slides.length;
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), count - 1));
  const [width, setWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const hasTrackedSwipe = useRef(false);
  const previewAnimationRef = useRef<HTMLDivElement | null>(null);
  const [isDragBlocked, setIsDragBlocked] = useState(false);
  const optimizations = useDeviceOptimizations();
  const animationPresets = useMemo(() => getAnimationPresets(), []);

  // Device-specific touch optimization (only for mid-range/old iOS)
  useEffect(() => {
    if (!optimizations.shouldReduceMotion || !viewportRef.current) return;
    
    const element = viewportRef.current;
    
    // Passive touch listeners for iOS scroll performance
    const handleTouchStart = (e: TouchEvent) => {
      (e.target as any).__startY = e.touches[0].clientY;
    };
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
    };
  }, [optimizations.shouldReduceMotion]);

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
      ...animationPresets.spring,
    });
    return controls.stop;
  }, [index, animationPresets]);

  // notify parent of slide changes and track swipes
  useEffect(() => {
    if (onSlideChange) {
      onSlideChange(index);
    }

    // Haptic feedback on slide change (modern iOS only)
    if (animationPresets.enableHaptics && index > 0) {
      triggerHaptic('light');
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
  }, [index, onSlideChange, storyId, topicId, optimizations.shouldReduceMotion]);

  // Preview animation effect - more pronounced nudge
  useEffect(() => {
    if (!showPreviewAnimation || !previewAnimationRef.current) return;
    
    const element = previewAnimationRef.current;
    const sessionKey = topicId ? `swipe_preview_shown_${topicId}` : 'swipe_preview_shown_default';
    
    // Check if animation already shown in this session
    if (sessionStorage.getItem(sessionKey)) return;
    
    const timer = setTimeout(() => {
      const controls = animate(element, 
        { x: [0, -40, 0] }, 
        { 
          duration: 1.8,
          ease: "easeInOut"
        }
      );
      
      // Mark as shown after animation completes
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
      setIndex((current) => {
        // Loop back to start after reaching the end
        return current >= count - 1 ? 0 : current + 1;
      });
    }, autoSlideInterval);
    
    return () => clearInterval(interval);
  }, [autoSlide, autoSlideInterval, count]);

  const clamp = (v: number) => Math.min(Math.max(v, 0), count - 1);
  const goTo = (i: number) => setIndex(clamp(i));
  const prev = () => goTo(index - 1);
  const next = () => goTo(index + 1);

  // Instagram-like gesture: smooth slide-by-slide navigation with velocity-weighted thresholds
  const onDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    // More responsive base threshold (20% instead of 25%)
    const baseThreshold = width * 0.20;
    const swipeDistance = info.offset.x;
    const swipeVelocity = info.velocity.x;
    
    // More sensitive velocity boost for snappy feel
    const velocityBoost = Math.min(Math.abs(swipeVelocity) / 800, 0.55) * animationPresets.swipeVelocityMultiplier;
    const effectiveThreshold = baseThreshold * (1 - velocityBoost);
    
    let targetIndex = index;
    
    // Lower minimum thresholds for faster response (30px/300 velocity instead of 40/400)
    if (swipeDistance > effectiveThreshold || (swipeDistance > 30 && swipeVelocity > 300)) {
      // Swiped right (previous slide)
      targetIndex = Math.max(0, index - 1);
    } else if (swipeDistance < -effectiveThreshold || (swipeDistance < -30 && swipeVelocity < -300)) {
      // Swiped left (next slide)
      targetIndex = Math.min(count - 1, index + 1);
    }
    
    // Animate to target slide with slightly tighter spring for snap
    const controls = animate(x, -targetIndex * width, {
      type: "spring",
      stiffness: animationPresets.spring.stiffness * 1.1,
      damping: animationPresets.spring.damping,
      mass: animationPresets.spring.mass * 0.95,
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
          className="flex h-full relative"
          drag={width > 0 && !isDragBlocked ? "x" : false}
          dragElastic={animationPresets.dragElastic}
          dragMomentum={true}
          dragConstraints={{ left: -(count - 1) * width, right: 0 }}
          dragTransition={{
            bounceStiffness: 400,
            bounceDamping: 30,
            power: animationPresets.dragTransition.power,
            timeConstant: animationPresets.dragTransition.timeConstant,
          }}
          whileDrag={{ cursor: "grabbing" }}
          style={{ 
            x, 
            touchAction: "pan-y pinch-zoom",
            willChange: 'transform',
            transform: 'translate3d(0, 0, 0)',
          }}
          onDragEnd={onDragEnd}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 grow-0 basis-full h-full">
              <div className="h-full w-full">{slide}</div>
            </div>
          ))}
          
        </motion.div>
      </div>

      {centerDragArea && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Left edge click handler for navigation - smaller on mobile */}
          <div
            className="absolute inset-y-0 left-0 w-[10%] md:w-[15%] pointer-events-auto cursor-pointer"
            onClick={() => {
              if (index > 0) {
                prev();
                console.debug?.('edge-click', 'left', 'prev');
              }
            }}
          />
          {/* Right edge click handler for navigation - smaller on mobile */}
          <div
            className="absolute inset-y-0 right-0 w-[10%] md:w-[15%] pointer-events-auto cursor-pointer"
            onClick={() => {
              if (index < count - 1) {
                next();
                console.debug?.('edge-click', 'right', 'next');
              }
            }}
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