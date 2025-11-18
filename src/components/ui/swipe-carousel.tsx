import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

// Debounce utility for ResizeObserver
const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

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
  const [isDragBlocked, setIsDragBlocked] = useState(false);

  // measure width with debouncing for Safari performance
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    
    const debouncedSetWidth = debounce((newWidth: number) => {
      setWidth(newWidth);
    }, 150);
    
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        debouncedSetWidth(Math.floor(entry.contentRect.width));
      }
    });
    
    ro.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // keep x aligned on resize (no animation)
  useEffect(() => {
    x.set(-index * width);
  }, [width]);

  // animate to index when changed via dots/click (optimized for Safari)
  useEffect(() => {
    const controls = animate(x, -index * width, {
      type: "spring",
      stiffness: 300,
      damping: 55,
      mass: 0.7,
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
      
      // Mark as shown after animation completes (deferred for Safari performance)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          sessionStorage.setItem(sessionKey, 'true');
        }, { timeout: 2000 });
      } else {
        setTimeout(() => {
          sessionStorage.setItem(sessionKey, 'true');
        }, 1400);
      }
      
      return () => controls.stop();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [showPreviewAnimation, topicId]);

  const clamp = (v: number) => Math.min(Math.max(v, 0), count - 1);
  const goTo = (i: number) => setIndex(clamp(i));
  const prev = () => goTo(index - 1);
  const next = () => goTo(index + 1);

  // Prevent iOS Safari horizontal navigation gestures
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !centerDragArea) return;

    const preventHorizontalGesture = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Don't prevent on interactive elements
      if (target.closest('button, a, input, textarea, [role="button"]')) return;
      
      // Prevent horizontal browser gestures on touch
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    viewport.addEventListener('touchstart', preventHorizontalGesture, { passive: false });
    return () => viewport.removeEventListener('touchstart', preventHorizontalGesture);
  }, [centerDragArea]);

  // Instagram-like gesture: smooth slide-by-slide navigation
  const onDragEnd = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const isMobile = width < 768;
    const threshold = width * (isMobile ? 0.2 : 0.25); // Easier on mobile
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
    
    // Animate to target slide (optimized for Safari)
    const controls = animate(x, -targetIndex * width, {
      type: "spring",
      stiffness: 280,
      damping: 50,
      mass: 0.7,
    });
    setIndex(targetIndex);
    return () => controls.stop();
  }, [width, index, x, count]);


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
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: centerDragArea ? 'pan-y' : 'manipulation'
        } as React.CSSProperties}
      >
        <motion.div
          className="flex h-full relative"
          drag={false}
          style={{ x }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 grow-0 basis-full h-full relative">
              <div className="h-full w-full">{slide}</div>
              
              {/* Center drag zone - only active when centerDragArea is enabled */}
              {centerDragArea && width > 0 && !isDragBlocked && (
                <motion.div
                  className="absolute top-0 bottom-[80px] left-[15%] right-[15%] cursor-grab active:cursor-grabbing"
                  style={{ 
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                  }}
                  drag="x"
                  dragElastic={0.15}
                  dragMomentum
                  dragConstraints={{ left: -(count - 1) * width, right: 0 }}
                  dragTransition={{ power: 0.25, timeConstant: 200 }}
                  onDragEnd={onDragEnd}
                />
              )}
            </div>
          ))}
          
        </motion.div>
      </div>

      {centerDragArea && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* Left edge click handler - blocks drag, allows tap navigation */}
          <div
            className="absolute inset-y-0 left-0 w-[15%] pointer-events-auto"
            style={{ touchAction: 'auto' }}
            onClick={() => {
              if (index > 0) {
                prev();
              }
            }}
          />
          {/* Right edge click handler - blocks drag, allows tap navigation */}
          <div
            className="absolute inset-y-0 right-0 w-[15%] pointer-events-auto"
            style={{ touchAction: 'auto' }}
            onClick={() => {
              if (index < count - 1) {
                next();
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