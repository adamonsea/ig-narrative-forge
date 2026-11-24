// @ts-nocheck -- vendored card-pack-reveal skill; written for looser compiler settings
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { RevealStage } from "./RevealStage";
import { FanDots } from "./FanDots";
import { SwipeHint } from "./SwipeHint";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { DEFAULT_BEATS, DEFAULT_SPRING } from "./constants";
import type { CardPackProps, CardPackTheme } from "./types";
import "./card-pack.css";

const DEFAULT_THEME: CardPackTheme = {
  bg: "transparent",
  sleeveFill: "#2E4A2C",
  sleeveText: "rgba(251, 246, 234, 0.85)",
  cardSurface: "#FBF6EA",
  cardBorder: "transparent",
  accent: "#B8864A",
  accentText: "#FBF6EA",
  title: "#2E4A2C",
  muted: "#6B6456",
  hairline: "rgba(28, 26, 20, 0.12)",
  radius: 28,
  serif: "'Fraunces', ui-serif, Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

function themeToCssVars(theme: Partial<CardPackTheme>): React.CSSProperties {
  const t = { ...DEFAULT_THEME, ...theme };
  const radius = typeof t.radius === "number" ? `${t.radius}px` : t.radius;
  return {
    ["--cp-bg" as string]: t.bg,
    ["--cp-sleeve-fill" as string]: t.sleeveFill,
    ["--cp-sleeve-text" as string]: t.sleeveText,
    ["--cp-card-surface" as string]: t.cardSurface,
    ["--cp-card-border" as string]: t.cardBorder,
    ["--cp-accent" as string]: t.accent,
    ["--cp-accent-text" as string]: t.accentText,
    ["--cp-title" as string]: t.title,
    ["--cp-muted" as string]: t.muted,
    ["--cp-hairline" as string]: t.hairline,
    ["--cp-radius" as string]: radius,
    ["--cp-serif" as string]: t.serif,
    ["--cp-mono" as string]: t.mono,
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const CardPack = ({
  sections,
  sleeve,
  renderSleeve,
  sleeveTexture,
  header,
  footer,
  theme,
  renderCard,
  onActivate,
  detailRenderer,
  onClose,
  reduceMotion = "auto",
  initialState = "closed",
  showDots = true,
  showCloseButton = true,
  showSwipeHint = true,
  sheen = false,
  aspect = 300 / 480,
  beats,
  spring,
  edgeBehaviour = "wrap",
  onBeat,
  onOpen,
  onSettle,
}: CardPackProps) => {
  const osReduced = usePrefersReducedMotion();
  const reduced = reduceMotion === "always" ? true : reduceMotion === "never" ? false : osReduced;
  const shouldAnimate = !reduced;

  const beatDelays = { ...DEFAULT_BEATS, ...beats };
  const springCfg = { ...DEFAULT_SPRING, ...spring };

  const [revealBeat, setRevealBeatState] = useState(() => (initialState === "open" ? 8 : 0));
  const [isReversing, setIsReversing] = useState(false);
  const [active, setActive] = useState(0);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hintDismiss, setHintDismiss] = useState(0);
  const sequenceRunningRef = useRef(false);
  const onBeatRef = useRef(onBeat);
  const onOpenRef = useRef(onOpen);
  const onSettleRef = useRef(onSettle);
  useEffect(() => { onBeatRef.current = onBeat; }, [onBeat]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onSettleRef.current = onSettle; }, [onSettle]);

  const setRevealBeat = useCallback((b: number) => {
    setRevealBeatState(b);
    onBeatRef.current?.(b);
  }, []);

  const runReveal = useCallback(async () => {
    if (sequenceRunningRef.current) return;
    sequenceRunningRef.current = true;
    try {
      if (reduced) { setRevealBeat(8); onOpenRef.current?.(); return; }
      for (const beat of [1, 2, 3, 4, 5, 6, 7] as const) {
        setRevealBeat(beat);
        await delay(beatDelays[beat]);
      }
      setRevealBeat(8);
      onOpenRef.current?.();
    } finally {
      sequenceRunningRef.current = false;
    }
  }, [reduced, beatDelays, setRevealBeat]);

  const runReverse = useCallback(async () => {
    if (sequenceRunningRef.current) return;
    sequenceRunningRef.current = true;
    setIsReversing(true);
    try {
      if (reduced) { setRevealBeat(0); return; }
      // Symmetric mirror of the forward beats — same delays, reverse order.
      for (const beat of [7, 6, 5, 4, 3, 2, 1] as const) {
        setRevealBeat(beat);
        await delay(beatDelays[beat]);
      }
      setRevealBeat(0);
    } finally {
      sequenceRunningRef.current = false;
      setIsReversing(false);
      onClose?.();
    }
  }, [reduced, beatDelays, setRevealBeat, onClose]);

  useEffect(() => {
    if (initialState === "open" && revealBeat < 8 && !sequenceRunningRef.current) {
      setRevealBeat(8);
    }
  }, [initialState, revealBeat, setRevealBeat]);

  const activeRectRef = useRef<DOMRect | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);

  const handleCardActivate = (i: number) => {
    if (i !== active) { setActive(i); return; }
    if (detailRenderer) {
      // Capture origin rect (relative to the stage wrap) for the morph.
      const card = activeRectRef.current;
      const wrap = stageWrapRef.current?.getBoundingClientRect();
      if (card && wrap) {
        setDetailOrigin({
          x: card.left - wrap.left + card.width / 2 - wrap.width / 2,
          y: card.top - wrap.top + card.height / 2 - wrap.height / 2,
          w: card.width,
          h: card.height,
        });
      } else {
        setDetailOrigin(null);
      }
      setDetailIndex(i);
      return;
    }
    onActivate?.(sections[i], i);
  };

  // Keyboard navigation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (revealBeat < 8) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runReveal(); }
      return;
    }
    if (detailIndex !== null) {
      if (e.key === "Escape") { e.preventDefault(); setDetailIndex(null); }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHintDismiss((n) => n + 1);
      setActive(edgeBehaviour === "wrap"
        ? (active - 1 + sections.length) % sections.length
        : Math.max(0, active - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHintDismiss((n) => n + 1);
      setActive(edgeBehaviour === "wrap"
        ? (active + 1) % sections.length
        : Math.min(sections.length - 1, active + 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardActivate(active);
    } else if (e.key === "Escape" && showCloseButton) {
      e.preventDefault();
      runReverse();
    }
  };

  // Fire onSettle when active changes (after first reveal).
  const lastActiveRef = useRef(active);
  useEffect(() => {
    if (revealBeat === 8 && lastActiveRef.current !== active) {
      lastActiveRef.current = active;
      onSettleRef.current?.(sections[active], active);
    }
  }, [active, revealBeat, sections]);

  const cssVars = themeToCssVars(theme ?? {});
  const headerVisible = revealBeat >= 7 && !isReversing;
  const fanSettled = revealBeat >= 7;
  const showClose = showCloseButton && revealBeat >= 8 && !isReversing && detailIndex === null;
  const liveMessage = revealBeat === 8 && detailIndex === null
    ? `Card ${active + 1} of ${sections.length}: ${sections[active]?.title ?? ""}`
    : "";

  return (
    <div
      className="cp-root flex flex-col h-full w-full relative"
      style={cssVars}
      role="region"
      aria-roledescription="card pack"
      aria-label={sleeve?.tagline ? `${sleeve.tagline} card pack` : "Card pack"}
    >
      <div className="cp-sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>

      <AnimatePresence>
        {detailIndex !== null && detailRenderer && (
          <motion.div
            key="detail"
            className="absolute inset-0 z-[300]"
            initial={detailOrigin
              ? { opacity: 0, scale: 0.6, x: detailOrigin.x, y: detailOrigin.y }
              : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={detailOrigin
              ? { opacity: 0, scale: 0.6, x: detailOrigin.x, y: detailOrigin.y, transition: { duration: 0.28 } }
              : { opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 240, damping: 30, mass: 0.9 }}
            style={{ transformOrigin: "50% 50%" }}
          >
            {detailRenderer(sections[detailIndex], () => setDetailIndex(null))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="flex-shrink-0"
        initial={false}
        animate={{ opacity: headerVisible ? 1 : 0, y: headerVisible ? 0 : 6 }}
        transition={{ duration: 0.4 }}
        aria-hidden={!headerVisible}
      >
        {header}
      </motion.div>

      {showClose && (
        <button
          onClick={runReverse}
          aria-label="Close pack"
          className="absolute right-3 z-50 w-9 h-9 rounded-full flex items-center justify-center cp-mono transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            background: "var(--cp-card-surface)",
            color: "var(--cp-title)",
            border: "1px solid var(--cp-accent)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)",
            outlineColor: "var(--cp-accent)",
          }}
        >
          <X size={16} strokeWidth={2.25} />
        </button>
      )}

      <div
        ref={stageWrapRef}
        className="cp-stage flex-1 min-h-0 relative outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Card deck — use arrow keys to navigate, Enter to open, Escape to close"
      >
        <RevealStage
          sections={sections}
          revealBeat={revealBeat}
          onBegin={runReveal}
          active={active}
          setActive={(next) => { setActive(next); setHintDismiss((n) => n + 1); }}
          onCardActivate={handleCardActivate}
          shouldAnimate={shouldAnimate}
          isReversing={isReversing}
          sleeve={sleeve}
          renderSleeve={renderSleeve}
          sleeveTexture={sleeveTexture}
          renderCard={renderCard}
          aspect={aspect}
          spring={springCfg}
          edgeBehaviour={edgeBehaviour}
          sheen={sheen}
          registerActiveCardRect={(rect) => { activeRectRef.current = rect; }}
        />
        {showSwipeHint && (
          <SwipeHint visible={fanSettled && !isReversing && detailIndex === null} dismissSignal={hintDismiss} />
        )}
      </div>

      {showDots && (
        <FanDots
          count={sections.length}
          active={active}
          visible={fanSettled && !isReversing}
          onSelect={(i) => { setActive(i); setHintDismiss((n) => n + 1); }}
        />
      )}

      <div className="flex-shrink-0">{footer}</div>
    </div>
  );
};

export type { CardPackSection, CardPackTheme, CardPackProps } from "./types";
