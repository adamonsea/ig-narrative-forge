import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const editorialEase = [0.19, 1, 0.22, 1] as const;

/** Full-bleed scroll chapter with a soft entry. */
export const ReviewChapter = ({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'inverted' | 'accent';
}) => (
  <section
    className={cn(
      'relative px-5 py-20 sm:py-28',
      tone === 'inverted' && 'bg-foreground text-background',
      tone === 'accent' && 'bg-muted',
      className
    )}
  >
    <div className="mx-auto w-full max-w-3xl">{children}</div>
  </section>
);

/** Fades and lifts its children when scrolled into view. */
export const Reveal = ({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduce ? 0.3 : 0.8, ease: editorialEase, delay }}
    >
      {children}
    </motion.div>
  );
};

/** Counts up to a value the first time it enters the viewport. */
export const CountUp = ({
  value,
  duration = 1400,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo so the number decelerates into place
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {shown.toLocaleString()}
    </span>
  );
};

/** Horizontal bar that grows from zero on scroll. */
export const GrowBar = ({ ratio, className }: { ratio: number; className?: string }) => {
  const reduce = useReducedMotion();
  return (
    <div className={cn('h-2 rounded-full bg-muted overflow-hidden', className)}>
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: reduce ? `${ratio * 100}%` : 0 }}
        whileInView={{ width: `${Math.max(2, ratio * 100)}%` }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: reduce ? 0 : 1, ease: editorialEase }}
      />
    </div>
  );
};

export { editorialEase };
