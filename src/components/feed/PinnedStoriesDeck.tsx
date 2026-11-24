import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  motion, useMotionValue, useTransform, useReducedMotion, animate, type MotionValue,
} from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Pin } from "lucide-react";
import { usePinnedStories, type PinnedStory } from "@/hooks/usePinnedStories";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";

/**
 * The owner's pinned stories as a fanned hand of cards above the feed.
 * Swipe or use arrow keys to browse; tap the centre card to open the story; tap a side card to bring it forward.
 * Purpose-built: sized from its own container, so it never spills into the header or the content below.
 * Swipes use our own pointer handling (not framer drag): framer's drag can get stuck on iOS Safari after a
 * page scroll starts on a card, so every gesture here resets on pointerup, pointercancel and lost capture.
 */
export function PinnedStoriesDeck({ topicId, topicSlug, brandColor }: {
  topicId: string; topicSlug?: string | null | undefined; brandColor?: string | null | undefined;
}) {
  const { data } = usePinnedStories(topicId);
  const navigate = useNavigate();
  const stories = data ?? [];
  const palette = feedBrandPalette(brandColor);
  if (!stories.length || !topicSlug) return null;
  return (
    <FanDeck
      stories={stories}
      accent={toCss(palette.light.fill)}
      onAccent={toCss(palette.light.onFill)}
      onOpen={(s) => navigate({ to: "/feed/$slug/story/$storyId", params: { slug: topicSlug, storyId: s.story_id } })}
    />
  );
}

const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
const SWIPE_DISTANCE = 60; // px
const SWIPE_VELOCITY = 450; // px/s

export function FanDeck({ stories, accent, onAccent, onOpen }: {
  stories: PinnedStory[]; accent: string; onAccent: string; onOpen: (s: PinnedStory) => void;
}) {
  const total = stories.length;
  const wrap = total > 2;
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [fanned, setFanned] = useState(false);
  const [browsed, setBrowsed] = useState(false); // "Pinned" pill folds to the icon once the reader browses
  const dragX = useMotionValue(0);
  const gesture = useRef<{ id: number; x0: number; y0: number; mode: "pending" | "h" | "v"; lastX: number; lastT: number; vx: number } | null>(null);
  const suppressClick = useRef(false);
  const rootRef = useRef<HTMLElement>(null);

  // Size from our own width, never the viewport.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const cardW = Math.round(Math.max(240, Math.min(width * 0.82, 360)));
  const cardH = Math.round(cardW * 1.28);
  const spread = Math.round(cardW * (total > 1 ? 0.2 : 0));

  // Keep the active index valid when pins change.
  useEffect(() => { if (active > total - 1) setActive(Math.max(0, total - 1)); }, [active, total]);

  // Fan out once, when the deck first comes into view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || fanned) return;
    if (reduced || typeof IntersectionObserver === "undefined") { setFanned(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e!.isIntersecting) { setFanned(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [fanned, reduced]);

  const go = useCallback((dir: number) => {
    setBrowsed(true);
    setActive((a) => wrap ? (a + dir + total) % total : Math.max(0, Math.min(total - 1, a + dir)));
  }, [wrap, total]);

  const settle = () => { animate(dragX, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }); };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (total < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: "pending", lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.mode === "v") return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.mode === "pending") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { g.mode = "v"; return; } // page scroll wins
      g.mode = "h";
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const atEdge = !wrap && ((dx > 0 && active === 0) || (dx < 0 && active === total - 1));
    dragX.set(atEdge ? dx * 0.3 : dx);
    const dt = Math.max(1, e.timeStamp - g.lastT);
    g.vx = ((e.clientX - g.lastX) / dt) * 1000;
    g.lastX = e.clientX; g.lastT = e.timeStamp;
  };
  const endGesture = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    // Touch starts implicitly captured by the card; taking capture here fires its lostpointercapture, which bubbles up. Ignore that one.
    if (e.type === "lostpointercapture" && e.target !== e.currentTarget) return;
    gesture.current = null;
    if (g.mode !== "h") return;
    suppressClick.current = true;
    const dx = dragX.get();
    if (e.type === "pointerup") {
      if (dx < -SWIPE_DISTANCE || g.vx < -SWIPE_VELOCITY) go(1);
      else if (dx > SWIPE_DISTANCE || g.vx > SWIPE_VELOCITY) go(-1);
    }
    settle();
  };

  const offsetOf = (i: number) => {
    let o = i - active;
    if (wrap) { if (o > total / 2) o -= total; if (o < -total / 2) o += total; }
    return o;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "Enter") { e.preventDefault(); onOpen(stories[active]!); }
  };

  return (
    <section
      ref={rootRef}
      aria-label="Pinned stories"
      aria-roledescription="carousel"
      className="mx-auto w-full max-w-2xl"
      style={{ overflowX: width < 560 ? "clip" : "visible" }}
    >
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onClickCapture={(e) => { if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); } }}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-[color:var(--deck-accent)] rounded-3xl"
        style={{ height: cardH + 36, touchAction: "pan-y", "--deck-accent": accent } as CSSProperties}
      >
        {width > 0 && stories.map((s, i) => {
          const o = offsetOf(i);
          return (
            <DeckCard
              key={s.story_id}
              story={s}
              offset={fanned ? o : 0}
              isCentre={o === 0}
              stackDepth={Math.abs(o)}
              cardW={cardW}
              cardH={cardH}
              spread={spread}
              accent={accent}
              onAccent={onAccent}
              reduced={!!reduced}
              dragX={dragX}
              pillOpen={!browsed && i === 0}
              onTap={() => (o === 0 ? onOpen(s) : (setBrowsed(true), setActive(i)))}
              label={`${i + 1} of ${total}: ${s.title ?? ""}`}
            />
          );
        })}
      </div>

      {total > 1 && (
        <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Choose a pinned story">
          {stories.map((s, i) => (
            <button
              key={s.story_id}
              role="tab"
              aria-selected={i === active}
              aria-label={`Pinned story ${i + 1}`}
              onClick={() => { setBrowsed(true); setActive(i); }}
              className="grid h-6 w-6 place-items-center"
            >
              <motion.span
                className="block h-2 rounded-full"
                animate={{ width: i === active ? 20 : 8, opacity: i === active ? 1 : 0.35 }}
                transition={reduced ? { duration: 0 } : SPRING}
                style={{ background: i === active ? accent : "hsl(var(--feed-on-background, 0 0% 100%))" }}
              />
            </button>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">{`Pinned story ${active + 1} of ${total}: ${stories[active]?.title ?? ""}`}</p>
    </section>
  );
}

function DeckCard({
  story, offset, isCentre, stackDepth, cardW, cardH, spread, accent, onAccent, reduced, dragX, pillOpen, onTap, label,
}: {
  story: PinnedStory; offset: number; isCentre: boolean; stackDepth: number; cardW: number; cardH: number; spread: number;
  accent: string; onAccent: string; reduced: boolean; dragX: MotionValue<number>; pillOpen: boolean; onTap: () => void; label: string;
}) {
  const abs = Math.abs(offset);
  const hidden = abs > 2;

  // Layout pose (springs). Drag lives on an inner layer so the two never fight.
  const pose = {
    x: offset * spread + (abs > 1 ? Math.sign(offset) * spread * 0.15 : 0),
    y: abs * 8,
    rotate: offset * 5,
    scale: 1 - abs * 0.06,
    opacity: hidden ? 0 : 1,
  };

  // Only the centre card follows the finger; side cards stay put.
  const still = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

  return (
    <motion.div
      className="absolute left-1/2 top-2"
      initial={false}
      animate={pose}
      transition={reduced ? { duration: 0 } : { ...SPRING, delay: stackDepth * 0.035 }}
      style={{
        width: cardW, height: cardH, marginLeft: -cardW / 2,
        zIndex: 50 - stackDepth, transformOrigin: "50% 90%",
        pointerEvents: hidden ? "none" : "auto",
      }}
      aria-hidden={!isCentre}
    >
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={onTap}
        whileTap={isCentre ? { scale: 0.985 } : {}}
        style={{
          x: isCentre ? dragX : still, rotate: isCentre ? dragRotate : still,
          boxShadow: isCentre
            ? "0 22px 44px -18px rgb(0 0 0 / 0.55), 0 6px 14px -6px rgb(0 0 0 / 0.25)"
            : "0 10px 24px -14px rgb(0 0 0 / 0.5)",
        }}
        className="relative block h-full w-full cursor-pointer select-none overflow-hidden rounded-[20px] bg-[hsl(var(--feed-card))] text-left text-[hsl(var(--feed-card-foreground))]"
      >
        {/* Picture fills the card; the headline panel rises over it on the centre card only. */}
        <div className="absolute inset-0" style={{ background: accent }}>
          {story.cover_url && (
            <img src={story.cover_url} alt="" draggable={false} loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>
        {/* Pin marker: opens as a "Pinned" pill on the first card, folds to the icon once the reader browses. */}
        <motion.span
          aria-hidden="true"
          className="absolute left-3 top-3 flex h-9 items-center overflow-hidden rounded-full shadow-md"
          style={{ background: accent, color: onAccent }}
          initial={false}
          animate={{ opacity: isCentre ? 1 : 0, scale: isCentre ? 1 : 0.6 }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Pin className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </span>
          <motion.span
            className="overflow-hidden whitespace-nowrap font-lexend text-[15px] font-semibold"
            initial={false}
            animate={{ width: pillOpen ? "auto" : 0, opacity: pillOpen ? 1 : 0, paddingRight: pillOpen ? 14 : 0 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
          >
            Pinned
          </motion.span>
        </motion.span>
        <motion.div
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-[hsl(var(--feed-card))] p-4"
          style={{ height: "48%" }}
          initial={false}
          animate={{ y: isCentre ? "0%" : "102%" }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
        >
          <h3
            className="line-clamp-3 font-lexend font-semibold uppercase leading-[1.1]"
            style={{ fontSize: Math.round(Math.max(21, Math.min(27, cardW / 13))) }}
          >
            {story.title}
          </h3>
          {story.source_name && <p className="mt-auto truncate text-sm opacity-70">{story.source_name}</p>}
        </motion.div>
        <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black" initial={false} animate={{ opacity: isCentre ? 0 : 0.18 }} />
      </motion.button>
    </motion.div>
  );
}
