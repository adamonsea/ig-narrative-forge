import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  motion, useMotionValue, useTransform, useReducedMotion, animate, type PanInfo,
} from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Pin } from "lucide-react";
import { usePinnedStories, type PinnedStory } from "@/hooks/usePinnedStories";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";

/**
 * The owner's pinned stories as a fanned hand of cards above the feed.
 * Swipe or use arrow keys to browse; tap the centre card to open the story; tap a side card to bring it forward.
 * Purpose-built (replaces the vendored card-pack): sized from its own container, so it never spills
 * into the header or the content below.
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
const SWIPE_VELOCITY = 400; // px/s

export function FanDeck({ stories, accent, onAccent, onOpen }: {
  stories: PinnedStory[]; accent: string; onAccent: string; onOpen: (s: PinnedStory) => void;
}) {
  const total = stories.length;
  const wrap = total > 2;
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [fanned, setFanned] = useState(false);
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
  const cardW = Math.round(Math.max(220, Math.min(width * 0.72, 340)));
  const cardH = Math.round(cardW * 1.28);
  const spread = Math.round(cardW * (total > 1 ? 0.36 : 0));

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
    setActive((a) => wrap ? (a + dir + total) % total : Math.max(0, Math.min(total - 1, a + dir)));
  }, [wrap, total]);

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
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-[color:var(--deck-accent)] rounded-3xl"
        style={{ height: cardH + 36, "--deck-accent": accent } as CSSProperties}
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
              onSwipe={go}
              onTap={() => (o === 0 ? onOpen(s) : setActive(i))}
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
              onClick={() => setActive(i)}
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
  story, offset, isCentre, stackDepth, cardW, cardH, spread, accent, onAccent, reduced, onSwipe, onTap, label,
}: {
  story: PinnedStory; offset: number; isCentre: boolean; stackDepth: number; cardW: number; cardH: number; spread: number;
  accent: string; onAccent: string; reduced: boolean; onSwipe: (dir: number) => void; onTap: () => void; label: string;
}) {
  const abs = Math.abs(offset);
  const hidden = abs > 2;

  // Layout pose (springs). Drag lives on an inner layer so the two never fight.
  const pose = {
    x: offset * spread + (abs > 1 ? Math.sign(offset) * spread * 0.15 : 0),
    y: abs * 10,
    rotate: offset * 6,
    scale: 1 - abs * 0.07,
    opacity: hidden ? 0 : 1,
  };

  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);
  const dragged = useRef(false);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (dx < -SWIPE_DISTANCE || vx < -SWIPE_VELOCITY) onSwipe(1);
    else if (dx > SWIPE_DISTANCE || vx > SWIPE_VELOCITY) onSwipe(-1);
    animate(dragX, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 });
    setTimeout(() => { dragged.current = false; }, 0);
  };

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
        drag={isCentre ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        dragMomentum={false}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={onDragEnd}
        onClick={() => { if (!dragged.current) onTap(); }}
        whileTap={isCentre ? { scale: 0.985 } : {}}
        style={{
          x: dragX, rotate: dragRotate, touchAction: "pan-y",
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
        <motion.span
          aria-hidden="true"
          className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full shadow-md"
          style={{ background: accent, color: onAccent }}
          initial={false}
          animate={{ opacity: isCentre ? 1 : 0, scale: isCentre ? 1 : 0.6 }}
        >
          <Pin className="h-4 w-4" strokeWidth={2.4} />
        </motion.span>
        <motion.div
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-[hsl(var(--feed-card))] p-4"
          style={{ height: "46%" }}
          initial={false}
          animate={{ y: isCentre ? "0%" : "102%" }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
        >
          <h3
            className="line-clamp-3 font-lexend font-semibold uppercase leading-[1.1]"
            style={{ fontSize: Math.round(Math.max(17, Math.min(23, cardW / 15))) }}
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
