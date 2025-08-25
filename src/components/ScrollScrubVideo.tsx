import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";

interface ScrollScrubVideoProps {
  src: string;
  poster?: string;
  pinHeight?: number;
  startOffset?: "start end" | "end start" | "start start" | "end end" | "center start" | "center end" | "center center";
  endOffset?: "start end" | "end start" | "start start" | "end end" | "center start" | "center end" | "center center";
  className?: string;
  objectFit?: "cover" | "contain";
  debug?: boolean;
}

/**
 * Apple‑style scroll‑scrubbed video with a pinned/sticky stage.
 * Drop into Lovable as a component and import where needed.
 *
 * Props
 * - src: string (required) — MP4/WebM URL
 * - poster: string (optional) — placeholder image
 * - pinHeight: number (vh) — total scroll distance; default 400 (i.e., 4 viewports)
 * - startOffset / endOffset: CSS scroll offsets for when progress = 0 → 1
 *   (default: ["start end", "end start"]) — tune when the scrub starts/ends.
 * - className: string — extra classes for the outer wrapper
 * - objectFit: "cover" | "contain" — default "cover"
 * - debug: boolean — shows a tiny progress HUD when true
 *
 * Notes
 * - For best results: use short, well‑encoded, muted videos (H.264, 24–30fps).
 * - iOS limits ultra‑rapid seeking; we use rAF smoothing to keep it stable.
 */
export default function ScrollScrubVideo({
  src,
  poster,
  pinHeight = 400,
  startOffset = "start end",
  endOffset = "end start",
  className = "",
  objectFit = "cover",
  debug = false,
}: ScrollScrubVideoProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  // Track scroll progress across the section (0 → 1)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: [startOffset, endOffset],
  });

  // rAF loop to gently seek without spamming currentTime
  const desiredTimeRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const step = () => {
      const video = videoRef.current;
      if (video && ready && duration > 0) {
        const now = desiredTimeRef.current;
        // Only seek when we meaningfully differ (saves battery on mobile)
        if (Math.abs(video.currentTime - now) > 0.02) {
          try {
            video.currentTime = now;
          } catch (e) {
            // Some browsers may throw during scrubbing while not ready — ignore.
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, duration]);

  // Update desired scrub time on scroll
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (duration > 0) desiredTimeRef.current = clamp(v, 0, 1) * duration;
  });

  // Once metadata is loaded, mark as ready
  const onLoadedMetadata = () => {
    const d = videoRef.current?.duration || 0;
    setDuration(isFinite(d) ? d : 0);
    setReady(true);
  };

  // Prevent autoplay; we scrub manually. Ensure muted + playsInline for iOS.
  const commonVideoProps = useMemo(
    () => ({
      playsInline: true,
      muted: true,
      preload: "auto" as const,
      controls: false,
      disablePictureInPicture: true,
      "webkit-playsinline": "true",
    }),
    []
  );

  return (
    <section
      ref={sectionRef}
      className={`relative w-full ${className}`}
      style={{ height: `${pinHeight}vh` }}
    >
      {/* Sticky stage */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          onLoadedMetadata={onLoadedMetadata}
          {...commonVideoProps}
          style={{
            width: "100%",
            height: "100%",
            objectFit,
          }}
        />
        {debug && (
          <div className="absolute bottom-3 right-3 rounded-md bg-white/70 px-2 py-1 text-xs font-mono">
            dur: {duration.toFixed(2)}s · prog: {scrollYProgress.get().toFixed(3)}
          </div>
        )}
      </div>
    </section>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * QUICK USAGE (example)
 *
 * import ScrollScrubVideo from "./ScrollScrubVideo";
 *
 * export default function ProductHero() {
 *   return (
 *     <div className="w-full">
 *       <ScrollScrubVideo
 *         src="/videos/hero-sequence.mp4"
 *         poster="/images/hero-poster.jpg"
 *         pinHeight={400}
 *         startOffset="start end"
 *         endOffset="end start"
 *         objectFit="cover"
 *       />
 *       <section className="mx-auto max-w-3xl p-8">
 *         <h2 className="text-3xl font-semibold">Headline continues here</h2>
 *         <p className="mt-4 text-lg opacity-80">Your copy below the pinned sequence…</p>
 *       </section>
 *     </div>
 *   );
 * }
 */