import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ElementType, ReactNode } from 'react';

interface Segment {
  text: string;
  italic?: boolean;
  className?: string;
}

interface MaskRevealHeadingProps {
  /** Either a plain string or styled segments (e.g. italic runs). */
  segments: string | Segment[];
  as?: ElementType;
  className?: string;
  /** Animate on scroll into view (default) vs immediately on mount. */
  onScroll?: boolean;
  children?: ReactNode;
}

const editorialEase = [0.19, 1, 0.22, 1] as const;

/**
 * Editorial kinetic heading: words rise from behind a clipping mask.
 * The mask wrapper uses generous vertical padding so italic descenders
 * (p, y, g, j) are never clipped.
 */
export const MaskRevealHeading = ({
  segments,
  as: Tag = 'h2',
  className,
  onScroll = true,
}: MaskRevealHeadingProps) => {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { delayChildren: 0.05, staggerChildren: reduce ? 0 : 0.08 } },
  };
  const word: Variants = {
    hidden: { y: reduce ? 0 : '110%', opacity: reduce ? 0 : 1 },
    show: { y: 0, opacity: 1, transition: { duration: reduce ? 0.3 : 0.85, ease: editorialEase } },
  };

  const runs: Segment[] = typeof segments === 'string' ? [{ text: segments }] : segments;
  const words = runs.flatMap((run, ri) =>
    run.text.split(' ').filter(Boolean).map((w, wi) => ({
      key: `${ri}-${wi}`,
      text: w,
      italic: run.italic,
      className: run.className,
    }))
  );

  const animProps = onScroll
    ? { initial: 'hidden' as const, whileInView: 'show' as const, viewport: { once: true, margin: '-80px' } }
    : { initial: 'hidden' as const, animate: 'show' as const };

  const MotionTag = motion(Tag as ElementType);

  return (
    <MotionTag variants={container} {...animProps} className={className}>
      {words.map((w) => (
        <span
          key={w.key}
          className="inline-block overflow-hidden align-bottom pb-[0.18em] -mb-[0.18em] mr-[0.25em]"
        >
          <motion.span variants={word} className={cn('inline-block', w.italic && 'italic pr-[0.06em]', w.className)}>
            {w.text}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
};