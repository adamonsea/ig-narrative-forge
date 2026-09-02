import { GRAIN_URL } from '@/lib/reviewPalette';

/** Fine film grain, sits above the gradient wash and below slide content. */
export const GrainOverlay = ({ opacity = 0.045 }: { opacity?: number }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 mix-blend-overlay"
    style={{ backgroundImage: GRAIN_URL, backgroundRepeat: 'repeat', opacity }}
  />
);
