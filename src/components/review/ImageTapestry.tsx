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
 * A woven column of small covers running beside slide content on wide screens,
 * folding into a single tight row on phones.
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
  const tiles = covers.filter((c) => c.cover_illustration_url).slice(0, 12);
  if (tiles.length < 4) return null;

  return (
    <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-2">
      {tiles.map((c, i) => (
        <motion.div
          key={c.id}
          initial={reduce ? undefined : { opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-30px' }}
          transition={{
            duration: reduce ? 0 : 0.55,
            delay: reduce ? 0 : (i % 6) * 0.05 + Math.floor(i / 6) * 0.08,
            ease: [0.16, 1, 0.3, 1],
          }}
          className={i % 5 === 0 ? 'lg:col-span-2' : undefined}
        >
          <button
            type="button"
            onClick={() => openPreview(c)}
            title={c.title}
            className="block w-full overflow-hidden rounded-md"
          >
            <img
              src={
                optimizeImageUrl(c.cover_illustration_url, { width: 320, height: 320, quality: 68 }) ??
                c.cover_illustration_url ??
                ''
              }
              alt=""
              loading="lazy"
              className={`w-full object-cover transition-transform duration-500 hover:scale-105 ${
                i % 5 === 0 ? 'aspect-[16/10]' : 'aspect-square'
              }`}
            />
          </button>
        </motion.div>
      ))}
    </div>
  );
};
