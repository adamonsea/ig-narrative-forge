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

  // animate to new index
  useEffect(() => {
    const controls = animate(x, -index * width, {
      type: "tween",
      ease: [0.22, 1, 0.36, 1],
      duration: 0.55,
    });
    return controls.stop;
  }, [index, width, x]);

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

  const onDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipe = info.offset.x + info.velocity.x * 0.35;
    const threshold = Math.min(0.22 * width, 160);
    if (swipe > threshold) prev();
    else if (swipe < -threshold) next();
    else goTo(index);
  };

  const heightStyle = useMemo(() => ({ height: typeof height === "number" ? `${height}px` : height }), [height]);

  if (count === 0) return null;

  return (
    <div className={"relative select-none " + className} role="region" aria-roledescription="carousel" aria-label={ariaLabel}>
      <div ref={viewportRef} className="overflow-hidden w-full" style={heightStyle}>
        <motion.div
          className="flex h-full"
          drag="x"
          dragElastic={0.18}
          dragConstraints={{ left: -(count - 1) * width, right: 0 }}
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

      {/* Click zones for desktop */}
      {count > 1 && (
        <div className="absolute inset-0 flex pointer-events-none">
          <button 
            onClick={prev} 
            aria-label="Previous slide" 
            className="w-1/2 h-full cursor-w-resize focus:outline-none pointer-events-auto" 
            disabled={index === 0}
          />
          <button 
            onClick={next} 
            aria-label="Next slide" 
            className="w-1/2 h-full cursor-e-resize focus:outline-none pointer-events-auto" 
            disabled={index === count - 1}
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