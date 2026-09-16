import { motion, useReducedMotion } from 'framer-motion';
import { optimizeImageUrl } from '@/lib/imageOptimization';
import { useStoryPreview } from './StoryPreview';

type CarouselStory = {
  id: string;
  slug: string | null;
  title: string;
  cover_illustration_url: string | null;
  note?: string;
};

/** Horizontal, snapping run of large covers — swipe or drag through a beat. */
export const ImageCarousel = ({
  stories,
  feedSlug,
}: {
  stories: CarouselStory[];
  feedSlug?: string;
}) => {
  const reduce = useReducedMotion();
  const { open: openPreview } = useStoryPreview();
  const items = stories.filter((s) => s.cover_illustration_url).slice(0, 10);
  if (items.length === 0) return null;

  return (
    <div
      className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2"
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((story, i) => (
        <motion.div
          key={story.id}
          className="w-[78%] shrink-0 snap-center sm:w-[62%]"
          initial={reduce ? undefined : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            type="button"
            onClick={() => openPreview(story)}
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
  );
};
