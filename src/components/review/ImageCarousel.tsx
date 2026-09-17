import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { optimizeImageUrl } from '@/lib/imageOptimization';
import { useStoryPreview } from './StoryPreview';

type CarouselStory = {
  id: string;
  slug: string | null;
  title: string;
  cover_illustration_url: string | null;
  note?: string;
};

/** Horizontal, snapping run of large covers with clear arrows and position dots. */
export const ImageCarousel = ({
  stories,
  feedSlug,
}: {
  stories: CarouselStory[];
  feedSlug?: string;
}) => {
  const reduce = useReducedMotion();
  const { open: openPreview } = useStoryPreview();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = stories.filter((s) => s.cover_illustration_url).slice(0, 10);

  const syncActive = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = el.scrollWidth / Math.max(items.length, 1);
    setActive(Math.round(el.scrollLeft / Math.max(step, 1)));
  }, [items.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', syncActive, { passive: true });
    return () => el.removeEventListener('scroll', syncActive);
  }, [syncActive]);

  const go = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = el.scrollWidth / Math.max(items.length, 1);
    el.scrollBy({ left: dir * step, behavior: reduce ? 'auto' : 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p
          className="text-[0.7rem] font-medium uppercase tracking-[0.22em] opacity-70"
          style={{ color: 'var(--review-accent, currentColor)' }}
        >
          {active + 1} of {items.length} · tap a picture to read
        </p>
        <div className="flex gap-2">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => go(dir)}
              disabled={dir === -1 ? active === 0 : active >= items.length - 1}
              aria-label={dir === -1 ? 'Previous story' : 'Next story'}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 transition-opacity disabled:opacity-30"
              style={{ borderColor: 'var(--review-accent, currentColor)', color: 'var(--review-accent, currentColor)' }}
            >
              {dir === -1 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-review-scroller
        className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((story, i) => (
          <motion.div
            key={story.id}
            className="w-[80%] shrink-0 snap-center sm:w-[46%] xl:w-[31%]"
            initial={reduce ? undefined : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={() => openPreview(story)}
              aria-label={`Open story: ${story.title}`}
              className="group block w-full overflow-hidden rounded-2xl border border-border/60 bg-background/40 text-left"
            >
              <img
                src={
                  optimizeImageUrl(story.cover_illustration_url, { width: 800, height: 600, quality: 76 }) ??
                  story.cover_illustration_url ??
                  ''
                }
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="p-4">
                <p className="text-base font-medium leading-snug line-clamp-3">{story.title}</p>
                {story.note && <p className="mt-1.5 text-sm opacity-60">{story.note}</p>}
              </div>
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex gap-1.5">
        {items.map((s, i) => (
          <span
            key={s.id}
            className="h-1.5 flex-1 rounded-full transition-opacity"
            style={{
              background: 'var(--review-accent, currentColor)',
              opacity: i === active ? 0.9 : 0.2,
            }}
          />
        ))}
      </div>
    </div>
  );
};
