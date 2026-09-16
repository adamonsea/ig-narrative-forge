import { motion, useReducedMotion } from 'framer-motion';
import { optimizeImageUrl } from '@/lib/imageOptimization';
import { useStoryPreview } from './StoryPreview';

type TapestryCover = {
  id: string;
  slug: string | null;
  title: string;
  cover_illustration_url: string | null;
};

/**
 * An even gallery of covers beside slide content. Every tile is the same size
 * so it reads as one browsable set, and each tile states that it opens a story.
 */
export const ImageTapestry = ({
  covers,
  feedSlug,
}: {
  covers: TapestryCover[];
  feedSlug?: string;
}) => {
  const reduce = useReducedMotion();
  const { open: openPreview } = useStoryPreview();
  const tiles = covers.filter((c) => c.cover_illustration_url).slice(0, 6);
  if (tiles.length < 4) return null;

  return (
    <div>
      <p
        className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.22em] opacity-70"
        style={{ color: 'var(--review-accent, currentColor)' }}
      >
        Tap a picture to read the story
      </p>
      <div className="grid grid-cols-2 gap-[clamp(0.5rem,0.8vw,1rem)]">
        {tiles.map((c, i) => (
          <motion.div
            key={c.id}
            initial={reduce ? undefined : { opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-30px' }}
            transition={{
              duration: reduce ? 0 : 0.55,
              delay: reduce ? 0 : (i % 3) * 0.05 + Math.floor(i / 3) * 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <button
              type="button"
              onClick={() => openPreview(c)}
              title={c.title}
              aria-label={`Open story: ${c.title}`}
              className="group block w-full overflow-hidden rounded-lg border border-current/10 text-left focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--review-accent, currentColor)' }}
            >
              <img
                src={
                  optimizeImageUrl(c.cover_illustration_url, { width: 600, height: 450, quality: 74 }) ??
                  c.cover_illustration_url ??
                  ''
                }
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="block p-[clamp(0.5rem,0.7vw,0.85rem)] text-[clamp(0.8rem,0.85vw,1rem)] font-medium leading-snug line-clamp-2">
                {c.title}
              </span>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
