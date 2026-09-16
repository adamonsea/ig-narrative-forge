import { motion, useReducedMotion } from 'framer-motion';
import { optimizeImageUrl } from '@/lib/imageOptimization';
import { useStoryPreview } from './StoryPreview';
import { editorialEase } from './ReviewChapter';

export interface GridStory {
  id: string;
  slug?: string | null;
  title: string;
  cover_illustration_url?: string | null;
}

const Card = ({ story, index }: { story: GridStory; index: number }) => {
  const reduce = useReducedMotion();
  const { open: openPreview } = useStoryPreview();
  const src = story.cover_illustration_url
    ? optimizeImageUrl(story.cover_illustration_url, { width: 720, height: 540, quality: 78 })
    : null;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: reduce ? 0.3 : 0.6, delay: reduce ? 0 : index * 0.07, ease: editorialEase }}
    >
      <button
        type="button"
        onClick={() => openPreview(story)}
        aria-label={`Open story: ${story.title}`}
        className="group block h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-background/40 text-left transition-transform duration-300 hover:-translate-y-1"
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <span
            className="flex aspect-[4/3] w-full items-end p-4 text-[clamp(0.95rem,1.1vw,1.15rem)] font-medium leading-tight"
            style={{ background: 'var(--review-accent-soft)' }}
          >
            {story.title}
          </span>
        )}
        <p className="p-[clamp(0.85rem,1vw,1.25rem)] text-[clamp(0.95rem,1.05vw,1.2rem)] font-medium leading-snug line-clamp-3">
          {story.title}
        </p>
      </button>
    </motion.div>
  );
};

/**
 * Even grid of story covers for one beat. Every card is the same size with its
 * headline always visible, so the set is readable and clickable at any width.
 */
export const StoryImageGrid = ({ stories }: { stories: GridStory[]; feedSlug?: string }) => {
  if (stories.length === 0) return null;
  const items = stories.slice(0, 6);

  return (
    <div className="grid grid-cols-1 gap-[clamp(0.75rem,1.2vw,1.5rem)] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((s, i) => (
        <Card key={s.id} story={s} index={i} />
      ))}
    </div>
  );
};
