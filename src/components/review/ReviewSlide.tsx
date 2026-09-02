import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { editorialEase } from './ReviewChapter';
import { GrainOverlay } from './GrainOverlay';
import { Odometer } from './Odometer';
import { Shimmer } from './Shimmer';
import { slideSkin } from '@/lib/reviewPalette';

/** One snackable, full-height card in the review deck. */
export const ReviewSlide = ({
  children,
  className,
  tone = 'default',
  label,
  hue,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'inverted' | 'accent';
  label?: string;
  /** Feed-derived hue for this slide's wash and accent. */
  hue?: number;
}) => {
  const skin = hue != null ? slideSkin(hue, tone === 'inverted') : null;

  return (
    <section
      className={cn(
        'snap-start snap-always relative flex min-h-dvh flex-col justify-center overflow-hidden px-6 py-16',
        tone === 'inverted' && 'bg-foreground text-background',
        tone === 'accent' && 'bg-muted',
        className
      )}
      style={skin ? (skin.vars as CSSProperties) : undefined}
    >
      {skin && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: skin.gradient }} />
          <GrainOverlay opacity={tone === 'inverted' ? 0.07 : 0.045} />
        </>
      )}
      <div className="relative mx-auto w-full max-w-lg">
        {label && <p className="mb-6 text-sm uppercase tracking-[0.22em] opacity-70">{label}</p>}
        {children}
      </div>
    </section>
  );
};

/**
 * A single dominant figure with a short caption underneath.
 * Pass `count` to get the odometer cascade plus a one-shot shimmer sweep.
 */
export const BigStat = ({
  value,
  count,
  caption,
  suffix,
  prefix,
}: {
  value?: ReactNode;
  count?: number;
  caption: string;
  suffix?: string;
  prefix?: string;
}) => (
  <div>
    <div
      className="text-[clamp(3.5rem,18vw,7rem)] font-semibold leading-[0.9] tracking-tight"
      style={{ color: 'var(--review-accent, currentColor)' }}
    >
      <Shimmer>
        {prefix}
        {count != null ? <Odometer value={count} /> : value}
        {suffix && <span className="text-[0.35em] align-top ml-1 opacity-60">{suffix}</span>}
      </Shimmer>
    </div>
    <p className="mt-5 text-lg leading-snug opacity-80">{caption}</p>
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
        <li key={item.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4 text-lg">
            <span className="font-medium truncate">{item.label}</span>
            <span className="tabular-nums opacity-70">
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
              style={{ backgroundColor: 'var(--review-accent)' }}
              initial={{ width: reduce ? `${(item.value / max) * 100}%` : 0 }}
              whileInView={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              viewport={{ once: true, margin: '-40px' }}
              // slight overshoot then settle — the draw-in
              transition={{
                duration: reduce ? 0 : 0.9,
                delay: reduce ? 0 : Math.max(0, 0.22 - i * 0.04) + i * 0.08,
                ease: editorialEase,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};
