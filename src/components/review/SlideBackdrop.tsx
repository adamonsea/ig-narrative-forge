import { motion, useReducedMotion } from 'framer-motion';
import { optimizeImageUrl } from '@/lib/imageOptimization';

/**
 * Full-bleed background wall built from the period's own illustrations.
 * Sits behind slide content, heavily scrimmed so text stays readable.
 */
export const SlideBackdrop = ({
  images,
  inverted = false,
}: {
  images: string[];
  inverted?: boolean;
}) => {
  const reduce = useReducedMotion();
  const tiles = images.slice(0, 24);
  if (tiles.length < 6) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -inset-[8%] grid grid-cols-4 gap-1 sm:grid-cols-6"
        initial={reduce ? undefined : { scale: 1.08, opacity: 0 }}
        animate={reduce ? { opacity: 0.45 } : { scale: 1, opacity: 0.45 }}
        transition={{ duration: reduce ? 0 : 2.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {tiles.map((url, i) => (
          <div key={`${url}-${i}`} className="aspect-square overflow-hidden">
            <img
              src={optimizeImageUrl(url, { width: 240, height: 240, quality: 60 }) ?? url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </motion.div>
      <div
        className="absolute inset-0 backdrop-blur-[2px]"
        style={{
          background: inverted
            ? 'radial-gradient(120% 90% at 20% 30%, hsl(var(--foreground) / 0.78), hsl(var(--foreground) / 0.96))'
            : 'radial-gradient(120% 90% at 20% 30%, hsl(var(--background) / 0.82), hsl(var(--background) / 0.97))',
        }}
      />
    </div>
  );
};
