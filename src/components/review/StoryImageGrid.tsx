import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getOptimizedImageUrl } from '@/lib/imageOptimization';
import { editorialEase } from './ReviewChapter';

export interface GridStory {
  id: string;
  slug?: string | null;
  title: string;
  cover_illustration_url?: string | null;
}

const Tile = ({
  story,
  feedSlug,
  index,
  lead,
}: {
  story: GridStory;
  feedSlug?: string;
  index: number;
  lead?: boolean;
}) => {
  const reduce = useReducedMotion();
  const src = story.cover_illustration_url
    ? getOptimizedImageUrl(story.cover_illustration_url, { width: lead ? 720 : 360, quality: 78 })
    : null;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, clipPath: 'inset(0 0 100% 0)' }}
      whileInView={{ opacity: 1, scale: 1, clipPath: 'inset(0 0 0% 0)' }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: reduce ? 0.3 : 0.75, delay: reduce ? 0 : index * 0.09, ease: editorialEase }}
      className={lead ? 'row-span-2' : undefined}
    >
      <Link
        to={feedSlug ? `/feed/${feedSlug}/story/${story.slug ?? story.id}` : '#'}
        className="group relative block h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-muted transition-transform duration-300 hover:-translate-y-1"
        style={{ aspectRatio: lead ? '0.95' : '1.618' }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <span
            className="flex h-full w-full items-end p-3 text-sm font-medium leading-tight"
            style={{ background: 'var(--review-accent-soft)' }}
          >
            {story.title}
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        >
          <span className="line-clamp-2 text-sm font-medium text-white">{story.title}</span>
        </span>
        <span className="sr-only">{story.title}</span>
      </Link>
    </motion.div>
  );
};

/**
 * Golden-ratio grid of story covers for one beat: a large lead tile alongside
 * a column of smaller ones, collapsing to a uniform grid on narrow screens.
 */
export const StoryImageGrid = ({
  stories,
  feedSlug,
}: {
  stories: GridStory[];
  feedSlug?: string;
}) => {
  if (stories.length === 0) return null;
  const [lead, ...rest] = stories.slice(0, 5);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.618fr_1fr]">
      <Tile story={lead} feedSlug={feedSlug} index={0} lead />
      <div className="flex flex-col gap-3">
        {rest.map((s, i) => (
          <Tile key={s.id} story={s} feedSlug={feedSlug} index={i + 1} />
        ))}
      </div>
    </div>
  );
};
