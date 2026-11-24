// @ts-nocheck -- vendored card-pack-reveal skill; written for looser compiler settings
import { forwardRef, useEffect, useRef, useState } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { REVEAL_EASE, DEFAULT_SPRING, FAN_SETTLE_SPRING } from "./constants";
import { computeFanLayout } from "./fanLayout";
import type { CardPackSection, SpringConfig } from "./types";

interface FanCardProps {
  section: CardPackSection;
  index: number;
  active: number;
  total: number;
  revealBeat: number;
  dragXMV: MotionValue<number>;
  peekDragYMV: MotionValue<number>;
  cardWidth: number;
  cardHeight: number;
  isDragging: boolean;
  shouldAnimate: boolean;
  onClick: () => void;
  sheen?: boolean;
  spring?: Required<SpringConfig>;
  renderCard?: (
    section: CardPackSection,
    ctx: { isCenter: boolean; index: number; active: number }
  ) => React.ReactNode;
}

function DefaultCardBody({
  section,
  isCenter,
  contentVisible,
}: {
  section: CardPackSection;
  isCenter: boolean;
  contentVisible: boolean;
}) {
  const [first, ...rest] = section.kicker.split(". ");
  const subtitle = rest.join(". ");
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
        opacity: contentVisible ? (isCenter ? 1 : 0.5) : 0,
        filter: isCenter ? "none" : "saturate(0.65)",
        transition: "opacity 0.3s, filter 0.3s",
      }}
    >
      <div className="cp-mono text-[13px] tracking-[0.28em] uppercase" style={{ color: "var(--cp-accent)" }}>
        {first}
      </div>
      <div className="flex-1 flex items-center justify-center py-3">
        <div style={{ width: "100%", maxWidth: "min(85%, 420px)", pointerEvents: "none" }}>
          {section.cover}
        </div>
      </div>
      <div className="cp-hair mb-3" />
      <h2
        className="cp-serif"
        style={{
          color: "var(--cp-title)",
          fontSize: "clamp(30px, 8.5vw, 48px)",
          lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.015em",
        }}
      >
        {section.title}
      </h2>
      {subtitle && (
        <div
          className="cp-serif italic text-[15px] mt-1.5"
          style={{ color: "var(--cp-muted)", lineHeight: 1.3 }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export const FanCard = forwardRef<HTMLDivElement, FanCardProps>(function FanCard(
  {
    section, index, active, total, revealBeat, dragXMV, peekDragYMV,
    cardWidth, cardHeight, isDragging, shouldAnimate, onClick,
    sheen, spring = DEFAULT_SPRING, renderCard,
  },
  ref,
) {
  const fanSettled = revealBeat >= 7;
  const swipeReady = revealBeat >= 8;

  const layout = computeFanLayout({ index, active, total, revealBeat, dragX: 0, cardWidth });
  const { tx, ty, rot, scale, opacity, delayMs, isCenter, absOffset, mode } = layout;

  const dragMultiplier = swipeReady
    ? isCenter ? 1
    : absOffset === 1 ? 0.18
    : absOffset === 2 ? 0.06
    : absOffset === 3 ? 0.03
    : 0
    : 0;
  const xMV = useTransform(dragXMV, (dx) => tx + dx * dragMultiplier);
  const rotateMV = useTransform(dragXMV, (dx) =>
    swipeReady && isCenter ? rot + dx * 0.015 : rot
  );
  const rotateYMV = useTransform(dragXMV, (dx) =>
    swipeReady && isCenter ? Math.max(-5, Math.min(5, dx * 0.04)) : 0
  );

  const peekActive = revealBeat < 1 && isCenter;
  const yPeekMV = useTransform(peekDragYMV, (dy) => (peekActive ? ty + dy : ty));
  const scalePeekMV = useTransform(peekDragYMV, (dy) =>
    peekActive ? scale + Math.min(0.04, Math.max(0, -dy / 160) * 0.04) : scale
  );

  const hasEnteredFanRef = useRef(false);
  const isFirstFanEntry = fanSettled && !hasEnteredFanRef.current;
  if (fanSettled) hasEnteredFanRef.current = true;

  // Scale-bump when this card BECOMES the centre via a swipe (not on first reveal).
  const prevIsCenterRef = useRef(isCenter);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (!swipeReady) { prevIsCenterRef.current = isCenter; return; }
    if (isCenter && !prevIsCenterRef.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 320);
      prevIsCenterRef.current = isCenter;
      return () => clearTimeout(t);
    }
    prevIsCenterRef.current = isCenter;
  }, [isCenter, swipeReady]);

  const breathing =
    isCenter && (mode === "lifted" || (mode === "stack" && revealBeat < 2));

  const transition = isDragging
    ? { duration: 0 }
    : isFirstFanEntry
    ? { type: "spring" as const, ...FAN_SETTLE_SPRING, delay: (3 - absOffset) * 0.06 }
    : fanSettled
    ? { type: "spring" as const, ...spring }
    : {
        duration: mode === "lifted" ? 0.42 : 0.5,
        ease: REVEAL_EASE,
        delay: shouldAnimate ? delayMs / 1000 : 0,
      };

  // Breathing animates scale + y + shadow-bias so the card feels alive, not rubbery.
  const targetScale = bump ? scale * 1.045 : scale;
  const animateProps = breathing
    ? { x: tx, y: [ty, ty - 2, ty], rotate: rot, scale: [scale, scale * 1.025, scale] }
    : { x: tx, y: ty, rotate: rot, scale: targetScale };

  const scaleTransition = breathing
    ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }
    : bump
    ? { type: "spring" as const, stiffness: 320, damping: 16 }
    : transition;

  const contentVisible = fanSettled ? absOffset <= 1 : isCenter;
  const showSheen = sheen && isCenter && swipeReady && !isDragging;

  return (
    <motion.div
      ref={ref}
      onClick={onClick}
      className="absolute cp-card-surface overflow-hidden"
      animate={animateProps}
      transition={{ ...transition, scale: scaleTransition, y: breathing ? scaleTransition : transition }}
      style={{
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        opacity,
        ...(swipeReady
          ? { x: xMV, rotate: rotateMV, rotateY: rotateYMV }
          : peekActive
          ? { y: yPeekMV, scale: scalePeekMV }
          : {}),
        zIndex: 100 - absOffset,
        pointerEvents: swipeReady && absOffset <= 3 ? "auto" : "none",
        cursor: swipeReady ? "pointer" : "default",
        boxShadow: isCenter
          ? "0 14px 30px -10px hsl(0 0% 0% / 0.28), 0 4px 10px hsl(0 0% 0% / 0.10)"
          : "0 4px 12px hsl(0 0% 0% / 0.10)",
        willChange: isDragging || revealBeat < 8 || breathing || bump ? "transform" : "auto",
      }}
      aria-roledescription="card"
      aria-label={`${section.title}${section.badge ? `, ${section.badge}` : ""}`}
      aria-current={swipeReady && isCenter ? "true" : undefined}
    >
      <div className="h-full">
        <div className="h-full flex flex-col p-5 relative">
          {section.badge && (
            <div
              className="absolute right-5 cp-mono text-[11px] tracking-[0.22em] uppercase px-2.5 py-1 rounded-full"
              style={{
                top: 18,
                background: "var(--cp-accent)",
                color: "var(--cp-accent-text)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                whiteSpace: "nowrap",
              }}
            >
              {section.badge}
            </div>
          )}
          {renderCard ? (
            <div
              style={{
                display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
                opacity: contentVisible ? (isCenter ? 1 : 0.5) : 0,
              }}
            >
              {renderCard(section, { isCenter, index, active })}
            </div>
          ) : (
            <DefaultCardBody section={section} isCenter={isCenter} contentVisible={contentVisible} />
          )}
        </div>
      </div>
      {showSheen && <div className="cp-sheen" aria-hidden />}
    </motion.div>
  );
});
