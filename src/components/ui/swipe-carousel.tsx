import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

export type SwipeCarouselProps = {
  slides: React.ReactNode[];
  className?: string;
  height?: number | string;
  initialIndex?: number;
  showDots?: boolean;
  onSlideChange?: (index: number) => void;
  ariaLabel?: string;
};

export function SwipeCarousel({
  slides,
  className = "",
  height = 360,
  initialIndex = 0,
  showDots = true,
  onSlideChange,
  ariaLabel = "Carousel",
}: SwipeCarouselProps) {
  const count = slides.length;
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), count - 1));
  const [width, setWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);

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

  // notify parent of slide changes
  useEffect(() => {
    if (onSlideChange) {
      onSlideChange(index);
    }
  }, [index, onSlideChange]);

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

  // Desktop click-to-advance without overlay (prevents drag blocking)
  const downX = useRef<number | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downX.current = e.clientX;
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (downX.current == null) return;
    if (Math.abs(e.clientX - downX.current) > 6) moved.current = true; // tiny slop
  };
  const onClickViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore if it was a drag
    if (moved.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    if (leftHalf) prev(); else next();
  };

  const heightStyle = useMemo(() => ({ height: typeof height === "number" ? `${height}px` : height }), [height]);

  if (count === 0) return null;

  return (
    <div className={"relative select-none h-full " + className} role="region" aria-roledescription="carousel" aria-label={ariaLabel} style={heightStyle}>
      <div 
        ref={viewportRef} 
        className="overflow-hidden w-full h-full" 
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClickViewport}
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
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 grow-0 basis-full h-full">
              <div className="h-full w-full">{slide}</div>
            </div>
          ))}
        </motion.div>
      </div>

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