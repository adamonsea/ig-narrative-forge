import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { editorialEase } from './ReviewChapter';
import { GrainOverlay } from './GrainOverlay';
import { SlideBackdrop } from './SlideBackdrop';
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
  backdrop,
  aside,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'inverted' | 'accent';
  label?: string;
  /** Feed-derived hue for this slide's wash and accent. */
  hue?: number;
  /** Illustration URLs to build a full-bleed background wall from. */
  backdrop?: string[];
  /** Optional imagery column shown beside the content on wide screens. */
  aside?: ReactNode;
}) => {
  const skin = hue != null ? slideSkin(hue, tone === 'inverted') : null;

  return (
    <section
      className={cn(
        'snap-start snap-always relative flex min-h-dvh flex-col justify-center overflow-hidden px-6 py-16 sm:px-10 lg:px-16 xl:px-24',
        tone === 'inverted' && 'bg-foreground text-background',
        tone === 'accent' && 'bg-muted',
        className
      )}
      style={skin ? (skin.vars as CSSProperties) : undefined}
    >
      {backdrop && backdrop.length > 0 && (
        <SlideBackdrop images={backdrop} inverted={tone === 'inverted'} />
      )}
      {skin && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: skin.gradient }} />
          <GrainOverlay opacity={tone === 'inverted' ? 0.07 : 0.045} />
        </>
      )}
      {aside ? (
        <div className="relative mx-auto grid w-full max-w-4xl gap-8 lg:max-w-6xl lg:gap-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center xl:max-w-7xl">
          <div className="w-full max-w-lg lg:max-w-2xl">
            {label && <p className="mb-6 text-xs font-medium uppercase tracking-[0.26em] sm:text-sm lg:mb-8" style={{ color: 'var(--review-accent, currentColor)', opacity: 0.85 }}>{label}</p>}
            {children}
          </div>
          <div className="w-full">{aside}</div>
        </div>
      ) : (
        <div className="relative mx-auto w-full max-w-lg lg:max-w-3xl xl:max-w-4xl">
          {label && <p className="mb-6 text-xs font-medium uppercase tracking-[0.26em] sm:text-sm lg:mb-8" style={{ color: 'var(--review-accent, currentColor)', opacity: 0.85 }}>{label}</p>}
          {children}
        </div>
      )}
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
      className="text-[clamp(3.5rem,13vw,12rem)] font-semibold leading-[0.88] tracking-[-0.02em]"
      style={{ color: 'var(--review-accent, currentColor)' }}
    >
      <Shimmer>
        {prefix}
        {count != null ? <Odometer value={count} /> : value}
        {suffix && <span className="text-[0.35em] align-top ml-1 opacity-60">{suffix}</span>}
      </Shimmer>
    </div>
    <p className="mt-6 text-[clamp(1.125rem,1.8vw,1.75rem)] leading-snug opacity-80">{caption}</p>
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
    <ul className="space-y-5 lg:space-y-7">
      {items.map((item, i) => (
        <li key={item.key} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4 text-[clamp(1.125rem,1.9vw,1.75rem)]">
            <span className="font-medium truncate">{item.label}</span>
            <span className="tabular-nums opacity-70">
              {item.value}
              {item.note && <span className="ml-2">{item.note}</span>}
            </span>
          </div>

          <div
            className={cn(
              'h-2 overflow-hidden rounded-full lg:h-2.5',
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
