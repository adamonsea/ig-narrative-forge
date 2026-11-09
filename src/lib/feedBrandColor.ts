/**
 * Feed-branded colours for reader-facing cards (e.g. the in-feed sign-up card).
 *
 * Takes whatever colour a feed has configured (hex like "#ec4899", bare HSL
 * like "217 91% 60%", or "hsl(...)/rgb(...)") and returns colours that pass
 * WCAG AA on the feed's own card surfaces in light and dark mode.
 *
 * The card surfaces mirror the feed tokens in index.css:
 *   light --feed-card 0 0% 100%,  --feed-card-foreground 146 41% 7%
 *   dark  --feed-card 146 41% 7%, --feed-card-foreground 210 40% 98%
 */

export type RGB = [number, number, number];

export const FEED_CARD_LIGHT: RGB = hslToRgb(0, 0, 100);
export const FEED_TEXT_DARK: RGB = hslToRgb(146, 41, 7); // feed's dark text colour
export const FEED_CARD_DARK: RGB = hslToRgb(146, 41, 7);
export const FEED_TEXT_LIGHT: RGB = hslToRgb(210, 40, 98);

const FALLBACK: RGB = FEED_TEXT_DARK;

export function hslToRgb(h: number, s: number, l: number): RGB {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Parse a configured feed colour. Returns null when it can't be read. */
export function parseColor(input: string | null | undefined): RGB | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();

  const hex = v.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]].map((n) => Math.min(255, n)) as RGB;

  const hsl = v.replace(/^hsla?\(/, '').replace(/\)$/, '')
    .match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hsl) return hslToRgb(((+hsl[1] % 360) + 360) % 360, +hsl[2], +hsl[3]);

  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

/** Move a colour towards `toward` in small steps until it reaches `ratio` against `bg`. */
function adjustUntil(color: RGB, bg: RGB, ratio: number, toward: RGB): RGB {
  let out = color;
  for (let t = 0; t <= 1.0001 && contrast(out, bg) < ratio; t += 0.05) {
    out = mix(color, toward, t);
  }
  return out;
}

export const toCss = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

export interface BrandTone {
  /** Button / active pill fill */
  fill: RGB;
  /** Label on the fill — always ≥ 4.5:1 */
  onFill: RGB;
  /** Accent text (e.g. italic feed name) on the card — always ≥ 4.5:1 */
  text: RGB;
}

/**
 * Pick the label colour for a filled button: white when it reads well,
 * otherwise the feed's dark text colour. If neither reaches AA, darken the
 * fill until white passes.
 */
export function buttonTone(fill: RGB, mode: 'light' | 'dark' = 'light'): { fill: RGB; onFill: RGB } {
  const white: RGB = [255, 255, 255];
  if (contrast(white, fill) >= 4.5) return { fill, onFill: white };
  if (contrast(FEED_TEXT_DARK, fill) >= 4.5) return { fill, onFill: FEED_TEXT_DARK };
  if (mode === 'dark') {
    // On dark cards, brighten so the dark label passes (keeps the button visible).
    return { fill: adjustUntil(fill, FEED_TEXT_DARK, 4.5, white), onFill: FEED_TEXT_DARK };
  }
  return { fill: adjustUntil(fill, white, 4.5, [0, 0, 0]), onFill: white };
}

export interface FeedBrandPalette {
  light: BrandTone;
  dark: BrandTone;
}

export function feedBrandPalette(input: string | null | undefined): FeedBrandPalette {
  const base = parseColor(input) ?? FALLBACK;

  // Light mode: button fill as configured; accent text darkened if too pale.
  const light = {
    ...buttonTone(base),
    text: adjustUntil(base, FEED_CARD_LIGHT, 4.5, FEED_TEXT_DARK),
  };

  // Dark mode: very dark feed colours would vanish on the dark card, so lift
  // the fill until the button shape is visible (3:1 non-text contrast).
  const darkFill = adjustUntil(base, FEED_CARD_DARK, 3, [255, 255, 255]);
  const dark = {
    ...buttonTone(darkFill, 'dark'),
    text: adjustUntil(base, FEED_CARD_DARK, 4.5, FEED_TEXT_LIGHT),
  };

  return { light, dark };
}
