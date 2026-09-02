import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts up to a value and reveals its digit groups in a phase cascade, so the
 * figure assembles rather than simply appearing. Reduced motion renders the
 * final value statically.
 */
export const Odometer = ({
  value,
  duration = 1600,
  className,
  onLanded,
}: {
  value: number;
  duration?: number;
  className?: string;
  onLanded?: () => void;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      onLanded?.();
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * easeOutExpo(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else onLanded?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // onLanded intentionally excluded — callers pass inline closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, duration, reduce]);

  // Split on thousands separators so each group can cascade in.
  const groups = useMemo(() => shown.toLocaleString().split(/([,.\s])/), [shown]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {groups.map((g, i) => (
        <motion.span
          key={`${i}-${g}`}
          className="inline-block"
          initial={reduce ? false : { opacity: 0, y: '0.35em' }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : i * 0.07, ease: [0.19, 1, 0.22, 1] }}
        >
          {g}
        </motion.span>
      ))}
    </span>
  );
};
