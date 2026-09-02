import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One-shot specular sweep across a headline figure, keyed to the slide accent.
 * Purely decorative — the child stays fully readable throughout.
 */
export const Shimmer = ({
  children,
  delay = 1.1,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();

  return (
    <span ref={ref} className={cn('relative inline-block overflow-hidden', className)}>
      {children}
      {!reduce && inView && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{
            background:
              'linear-gradient(100deg, transparent 0%, var(--review-accent-soft, transparent) 45%, transparent 100%)',
          }}
          initial={{ left: '-40%', opacity: 0 }}
          animate={{ left: ['-40%', '120%'], opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
};
