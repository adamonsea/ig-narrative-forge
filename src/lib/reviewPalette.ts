/**
 * Deterministic, feed-derived colour for insight reports.
 *
 * Feeds have no stored brand colour, so we hash the slug into a base hue and
 * walk a fixed editorial ramp for each chapter. Values are plain HSL strings so
 * slides can emit them as CSS custom properties (no hardcoded colour classes).
 */

const RAMP = [0, 28, 56, -32, 14, 84, -18, 42, 68, -46, 100, 8];

const hashString = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export const baseHueFor = (seed: string | undefined): number =>
  hashString(seed && seed.length > 0 ? seed : 'curatr') % 360;

export const hueForIndex = (baseHue: number, index: number): number =>
  (baseHue + RAMP[index % RAMP.length] + 360) % 360;

export interface SlideSkin {
  /** CSS custom properties to spread onto the slide element. */
  vars: Record<string, string>;
  /** Layered gradient wash for the slide background. */
  gradient: string;
}

/**
 * Builds the wash + accent for one slide.
 * `inverted` slides sit on the dark foreground colour, so the wash is brighter
 * and the accent is lifted to keep AA contrast against it.
 */
export const slideSkin = (hue: number, inverted = false): SlideSkin => {
  const accentL = inverted ? 72 : 42;
  const accentS = inverted ? 82 : 68;
  const accent = `hsl(${hue} ${accentS}% ${accentL}%)`;
  const accentSoft = `hsl(${hue} ${accentS}% ${accentL}% / ${inverted ? 0.24 : 0.14})`;

  const washA = inverted
    ? `hsl(${hue} 70% 55% / 0.22)`
    : `hsl(${hue} 78% 58% / 0.13)`;
  const washB = inverted
    ? `hsl(${(hue + 46) % 360} 70% 48% / 0.16)`
    : `hsl(${(hue + 46) % 360} 74% 62% / 0.10)`;

  const gradient = [
    `radial-gradient(120% 80% at 12% 8%, ${washA} 0%, transparent 62%)`,
    `radial-gradient(100% 70% at 92% 96%, ${washB} 0%, transparent 60%)`,
  ].join(', ');

  return {
    gradient,
    vars: {
      '--review-accent': accent,
      '--review-accent-soft': accentSoft,
      '--review-hue': String(hue),
    },
  };
};

/** Grain layer as an inline SVG data URI — no image assets, no extra request. */
export const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

/** Golden-ratio type scale, in rem, anchored on the caption size. */
export const PHI = 1.618;
