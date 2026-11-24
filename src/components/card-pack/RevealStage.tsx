// @ts-nocheck -- vendored card-pack-reveal skill; written for looser compiler settings
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion, AnimatePresence, useMotionValue, animate as fmAnimate, type PanInfo,
} from "framer-motion";
import { useSleeveSize } from "./useSleeveSize";
import { FanCard } from "./FanCard";
import { DefaultSleeve } from "./DefaultSleeve";
import { DEFAULT_SPRING, SLEEVE_DROP_SPRING } from "./constants";
import type {
  CardPackSection, CardPackSleeveConfig, EdgeBehaviour,
  RenderSleeveContext, SpringConfig,
} from "./types";

interface RevealStageProps {
  sections: CardPackSection[];
  revealBeat: number;
  onBegin: () => void;
  active: number;
  setActive: (next: number) => void;
  onCardActivate: (i: number) => void;
  shouldAnimate: boolean;
  isReversing?: boolean;
  sleeve?: CardPackSleeveConfig;
  renderSleeve?: (ctx: RenderSleeveContext) => React.ReactNode;
  sleeveTexture?: React.ReactNode;
  renderCard?: React.ComponentProps<typeof FanCard>["renderCard"];
  aspect: number;
  spring?: Required<SpringConfig>;
  edgeBehaviour: EdgeBehaviour;
  sheen?: boolean;
  /** Receives the DOM rect of the active card when needed (for detail morph origin). */
  registerActiveCardRect?: (rect: DOMRect | null) => void;
}

export const RevealStage = ({
  sections, revealBeat, onBegin, active, setActive, onCardActivate,
  shouldAnimate, isReversing = false, sleeve, renderSleeve, sleeveTexture,
  renderCard, aspect, spring = DEFAULT_SPRING, edgeBehaviour, sheen,
  registerActiveCardRect,
}: RevealStageProps) => {
  const { sleeveW, sleeveH } = useSleeveSize(aspect);
  const total = sections.length;
  const fanSettled = revealBeat >= 7;

  const NOTCH_W = Math.round(sleeveW * 0.28);
  const NOTCH_H = Math.round(NOTCH_W * 0.5);
  const SLEEVE_TOP_OFFSET = Math.round(sleeveH * 0.1);
  const notchMask = useMemo(
    () =>
      `radial-gradient(ellipse ${NOTCH_W / 2}px ${NOTCH_H}px at 50% 0%, transparent ${NOTCH_H}px, black ${NOTCH_H + 0.5}px)`,
    [NOTCH_W, NOTCH_H],
  );

  const cardInset = Math.round(sleeveW * 0.04);
  const cardW = sleeveW - cardInset * 2;
  const cardH = sleeveH - cardInset * 2;

  const peekDragY = useMotionValue(0);
  const triggeredRef = useRef(false);

  const handlePeekDrag = useCallback((_: unknown, info: PanInfo) => {
    if (revealBeat >= 1 || triggeredRef.current) return;
    peekDragY.set(Math.max(-160, Math.min(0, info.offset.y)));
  }, [revealBeat, peekDragY]);

  const handlePeekDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (revealBeat >= 1 || triggeredRef.current) return;
    if (info.offset.y < -50 || info.velocity.y < -300) {
      triggeredRef.current = true;
      onBegin();
    } else {
      fmAnimate(peekDragY, 0, { type: "spring", stiffness: 300, damping: 30 });
    }
  }, [revealBeat, peekDragY, onBegin]);

  useEffect(() => {
    if (revealBeat >= 1) fmAnimate(peekDragY, 0, { duration: 0.15 });
  }, [revealBeat, peekDragY]);

  useEffect(() => {
    if (revealBeat === 0) {
      triggeredRef.current = false;
      peekDragY.set(0);
    }
  }, [revealBeat, peekDragY]);

  // ── Horizontal swipe pipeline ──────────────────────────────────────────────
  const dragXMV = useMotionValue(0);
  const [isDraggingX, setIsDraggingX] = useState(false);
  const startXRef = useRef(0);
  const startTRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number }>({ x: 0, t: 0 });
  const draggedRef = useRef(false);
  const hasCapturedRef = useRef(false);

  const atLeftEdge = active === 0 && edgeBehaviour !== "wrap";
  const atRightEdge = active === total - 1 && edgeBehaviour !== "wrap";

  const handleStart = useCallback((clientX: number) => {
    if (!fanSettled) return;
    setIsDraggingX(true);
    draggedRef.current = false;
    hasCapturedRef.current = false;
    startXRef.current = clientX;
    startTRef.current = performance.now();
    lastMoveRef.current = { x: clientX, t: startTRef.current };
  }, [fanSettled]);

  const handleMove = useCallback((clientX: number) => {
    if (!isDraggingX) return;
    let dx = clientX - startXRef.current;
    if (Math.abs(dx) > 3) draggedRef.current = true;

    // Rubber-band when at edge and not wrapping.
    if ((dx > 0 && atLeftEdge) || (dx < 0 && atRightEdge)) {
      if (edgeBehaviour === "rubber") {
        const sign = Math.sign(dx);
        const mag = Math.min(Math.abs(dx), cardW * 0.4);
        dx = sign * Math.pow(mag, 0.78);
      } else {
        dx = 0; // clamp
      }
    }

    dragXMV.set(dx);
    lastMoveRef.current = { x: clientX, t: performance.now() };
  }, [isDraggingX, dragXMV, atLeftEdge, atRightEdge, edgeBehaviour, cardW]);

  const handleEnd = useCallback(() => {
    if (!isDraggingX) return;
    const finalDx = dragXMV.get();
    const now = performance.now();
    const dt = Math.max(16, now - lastMoveRef.current.t < 80 ? now - startTRef.current : 1000);
    const velocity = (finalDx / dt) * 1000; // px/s
    const threshold = 40;
    const flickThreshold = 600; // px/s
    const bigFlick = Math.abs(velocity) > flickThreshold && Math.abs(finalDx) > 20;

    let advance = 0;
    if (finalDx > threshold) advance = bigFlick ? -2 : -1;
    else if (finalDx < -threshold) advance = bigFlick ? 2 : 1;

    if (advance !== 0) {
      if (edgeBehaviour === "wrap") {
        setActive((active + advance + total * 2) % total);
      } else {
        const next = Math.max(0, Math.min(total - 1, active + advance));
        setActive(next);
      }
    }

    fmAnimate(dragXMV, 0, { type: "spring", stiffness: 400, damping: 32, mass: 0.6 });
    setIsDraggingX(false);
  }, [isDraggingX, dragXMV, total, active, setActive, edgeBehaviour]);

  const handleCardClick = (i: number) => {
    if (!fanSettled || draggedRef.current) return;
    onCardActivate(i);
  };

  // ── Sleeve drop choreography (symmetric forward/reverse) ──────────────────
  const sleeveDown = isReversing ? revealBeat >= 4 : revealBeat >= 3;
  const sleeveDropY = sleeveDown ? sleeveH + 240 : 0;
  const sleeveTilt = sleeveDown ? 2 : 0;
  const sleeveVisible = revealBeat < 5;

  // ── Refs for the active card (for detail-morph origin in parent) ─────────
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    if (!registerActiveCardRect) return;
    const el = cardRefs.current[active];
    registerActiveCardRect(el ? el.getBoundingClientRect() : null);
  }, [active, revealBeat, registerActiveCardRect]);

  const openLabel = sleeve?.openLabel ?? "Open";
  const openHandler = () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    onBegin();
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      onPointerDown={(e) => { if (fanSettled) handleStart(e.clientX); }}
      onPointerMove={(e) => {
        if (!fanSettled) return;
        if (!hasCapturedRef.current && isDraggingX) {
          const dx = e.clientX - startXRef.current;
          if (Math.abs(dx) > 3) {
            const el = e.currentTarget as HTMLElement;
            if (typeof el.setPointerCapture === "function") {
              try { el.setPointerCapture(e.pointerId); hasCapturedRef.current = true; } catch { /* ignore */ }
            }
          }
        }
        handleMove(e.clientX);
      }}
      onPointerUp={() => fanSettled && handleEnd()}
      onPointerCancel={() => fanSettled && handleEnd()}
      style={{ touchAction: fanSettled ? "pan-y" : "auto", perspective: 1400 }}
    >
      <div className="relative" style={{ width: sleeveW, height: sleeveH }}>
        <div
          className="absolute"
          style={{ left: cardInset, top: cardInset, width: cardW, height: cardH }}
        >
          {sections.map((section, i) => (
            <FanCard
              key={section.slug}
              ref={(el) => { cardRefs.current[i] = el; }}
              section={section}
              index={i}
              active={active}
              total={total}
              revealBeat={revealBeat}
              dragXMV={dragXMV}
              peekDragYMV={peekDragY}
              cardWidth={cardW}
              cardHeight={cardH}
              isDragging={isDraggingX}
              shouldAnimate={shouldAnimate}
              onClick={() => handleCardClick(i)}
              renderCard={renderCard}
              sheen={sheen}
              spring={spring}
            />
          ))}
        </div>

        <AnimatePresence>
          {sleeveVisible && (
            <motion.div
              key="sleeve"
              className={`absolute left-0 right-0 pointer-events-none ${revealBeat === 0 && !isReversing ? "cp-sleeve-breathe" : ""}`}
              style={{ top: SLEEVE_TOP_OFFSET, bottom: 0, zIndex: 200, transformOrigin: "50% 0%" }}
              initial={{ y: isReversing ? sleeveH + 240 : 0, rotate: isReversing ? 2 : 0 }}
              animate={{ y: sleeveDropY, rotate: sleeveTilt }}
              exit={{ y: sleeveH + 240, transition: { duration: 0 } }}
              transition={SLEEVE_DROP_SPRING}
            >
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  background: "var(--cp-sleeve-fill)",
                  borderBottomLeftRadius: "var(--cp-radius)",
                  borderBottomRightRadius: "var(--cp-radius)",
                  WebkitMaskImage: notchMask,
                  maskImage: notchMask,
                  boxShadow: "0 18px 40px -16px rgba(0,0,0,0.35)",
                }}
              >
                {sleeveTexture && (
                  <div className="absolute inset-0 pointer-events-none" aria-hidden>
                    {sleeveTexture}
                  </div>
                )}
                {renderSleeve
                  ? renderSleeve({ openLabel, onOpen: openHandler, beat: revealBeat })
                  : <DefaultSleeve openLabel={openLabel} onOpen={openHandler} beat={revealBeat} sleeve={sleeve} />}
              </div>

              {revealBeat < 1 && (
                <motion.div
                  className="absolute left-0 right-0 pointer-events-auto"
                  style={{
                    top: -SLEEVE_TOP_OFFSET - 12,
                    height: SLEEVE_TOP_OFFSET * 2 + 24,
                    zIndex: 20, cursor: "grab", touchAction: "none",
                  }}
                  drag="y"
                  dragConstraints={{ top: -160, bottom: 0 }}
                  dragElastic={0.2}
                  dragMomentum={false}
                  onDrag={handlePeekDrag}
                  onDragEnd={handlePeekDragEnd}
                  whileDrag={{ cursor: "grabbing" }}
                  aria-label="Pull card up to open"
                  role="button"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
