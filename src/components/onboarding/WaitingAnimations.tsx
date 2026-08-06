import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/**
 * Delightful, looping waiting animations for the "Add a topic" wizard.
 * All visuals use semantic design tokens and respect reduced-motion.
 */

/** Radar sweep with sites pinging in — used while sources are being discovered. */
export const SourceScanLoop = ({ className }: { className?: string }) => {
  const reduced = useReducedMotion();
  const pings = [
    { x: '18%', y: '30%', delay: 0 },
    { x: '72%', y: '22%', delay: 0.6 },
    { x: '62%', y: '70%', delay: 1.2 },
    { x: '28%', y: '68%', delay: 1.8 },
    { x: '48%', y: '14%', delay: 2.4 },
  ];

  return (
    <div
      className={cn('relative w-40 h-40 mx-auto', className)}
      role="img"
      aria-label="Scanning the web for sources"
    >
      {/* Rings */}
      {[1, 0.68, 0.36].map((scale, i) => (
        <div
          key={i}
          className="absolute inset-0 m-auto rounded-full border border-border"
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
        />
      ))}

      {/* Expanding pulse */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 m-auto rounded-full border-2 border-primary/40"
          style={{ width: '36%', height: '36%' }}
          animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {/* Sweep */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, hsl(var(--primary) / 0.28), transparent 32%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Centre dot */}
      <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-primary" />

      {/* Discovered sites */}
      {pings.map((p, i) => (
        <motion.span
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary"
          style={{ left: p.x, top: p.y }}
          animate={
            reduced
              ? { opacity: 0.6 }
              : { opacity: [0, 1, 1, 0], scale: [0.4, 1.2, 1, 0.6] }
          }
          transition={
            reduced
              ? undefined
              : { duration: 3, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
};

/** Paper clippings dropping onto a stack — used while the feed is being built. */
export const ClippingStackLoop = ({ className }: { className?: string }) => {
  const reduced = useReducedMotion();
  const cards = [0, 1, 2];

  return (
    <div
      className={cn('relative w-44 h-32 mx-auto', className)}
      role="img"
      aria-label="Gathering stories into your feed"
    >
      {/* Resting stack */}
      {[-6, -3, 0].map((rot, i) => (
        <div
          key={`base-${i}`}
          className="absolute left-1/2 bottom-2 w-28 h-20 -translate-x-1/2 rounded-md border border-border bg-card shadow-sm"
          style={{ transform: `translateX(-50%) rotate(${rot}deg)` }}
        />
      ))}

      {/* Falling clippings */}
      {cards.map((i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 bottom-2 w-28 h-20 -translate-x-1/2 rounded-md border border-border bg-card shadow-md p-2.5"
          initial={false}
          animate={
            reduced
              ? { opacity: 1, y: 0, rotate: 0 }
              : {
                  y: [-70, 0, 0, -70],
                  rotate: [8, (i - 1) * 5, (i - 1) * 5, 8],
                  opacity: [0, 1, 1, 0],
                }
          }
          transition={
            reduced
              ? undefined
              : { duration: 3.6, delay: i * 1.2, repeat: Infinity, ease: 'easeOut' }
          }
        >
          <div className="h-2 w-4/5 rounded-sm bg-foreground/70 mb-1.5" />
          <div className="h-1.5 w-full rounded-sm bg-muted-foreground/30 mb-1" />
          <div className="h-1.5 w-2/3 rounded-sm bg-muted-foreground/30" />
        </motion.div>
      ))}
    </div>
  );
};

/** Three soft pulsing dots — for small inline waits. */
export const PulsingDots = ({ className }: { className?: string }) => {
  const reduced = useReducedMotion();
  return (
    <div className={cn('flex items-center gap-1.5', className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-primary"
          animate={reduced ? { opacity: 0.5 } : { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={
            reduced
              ? undefined
              : { duration: 1.1, delay: i * 0.15, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
};

/** Skeleton pills that shimmer where source chips will appear. */
export const SourceChipSkeletons = ({ count = 6 }: { count?: number }) => {
  const reduced = useReducedMotion();
  const widths = [96, 132, 78, 148, 110, 88, 124, 92];
  return (
    <div className="flex flex-wrap justify-center gap-2.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="h-10 rounded-full bg-muted"
          style={{ width: widths[i % widths.length] }}
          animate={reduced ? { opacity: 0.6 } : { opacity: [0.35, 0.75, 0.35] }}
          transition={
            reduced
              ? undefined
              : { duration: 1.6, delay: i * 0.12, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
};
