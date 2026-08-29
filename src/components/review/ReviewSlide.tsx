import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { editorialEase } from './ReviewChapter';

/** One snackable, full-height card in the review deck. */
export const ReviewSlide = ({
  children,
  className,
  tone = 'default',
  label,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'inverted' | 'accent';
  label?: string;
}) => (
  <section
    className={cn(
      'snap-start snap-always relative flex min-h-dvh flex-col justify-center px-6 py-16',
      tone === 'inverted' && 'bg-foreground text-background',
      tone === 'accent' && 'bg-muted',
      className
    )}
  >
    <div className="mx-auto w-full max-w-lg">
      {label && (
        <p className="mb-6 text-sm uppercase tracking-[0.22em] opacity-70">{label}</p>
      )}
      {children}
    </div>
  </section>
);

/** A single dominant figure with a short caption underneath. */
export const BigStat = ({
  value,
  caption,
  suffix,
}: {
  value: ReactNode;
  caption: string;
  suffix?: string;
}) => (
  <div>
    <div className="text-[clamp(3.5rem,18vw,7rem)] font-semibold leading-[0.9] tracking-tight">
      {value}
      {suffix && <span className="text-[0.35em] align-top ml-1 opacity-60">{suffix}</span>}
    </div>
    <p className="mt-4 text-sm opacity-60">{caption}</p>
  </div>
);

/** Compact ranked list — five rows, bar-only, no prose. */
export const RankRows = ({
  items,
  tone = 'default',
}: {
  items: Array<{ key: string; label: string; value: number; note?: string }>;
  tone?: 'default' | 'inverted';
}) => {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-4">
      {items.map((item, i) => (
        <li key={item.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium truncate">{item.label}</span>
            <span className="tabular-nums opacity-60">
              {item.value}
              {item.note && <span className="ml-2">{item.note}</span>}
            </span>
          </div>
          <div
            className={cn(
              'h-1.5 overflow-hidden rounded-full',
              tone === 'inverted' ? 'bg-background/20' : 'bg-border'
            )}
          >
            <motion.div
              className={cn('h-full rounded-full', tone === 'inverted' ? 'bg-background' : 'bg-primary')}
              initial={{ width: reduce ? `${(item.value / max) * 100}%` : 0 }}
              whileInView={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : i * 0.06, ease: editorialEase }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};
