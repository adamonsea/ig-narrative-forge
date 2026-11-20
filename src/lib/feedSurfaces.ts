/**
 * Owner-chosen feed surfaces: the top bar and the page background behind the
 * story cards. The owner picks only those two colours; everything that sits on
 * them (welcome line, Live pill, Subscribe and menu buttons, the feed name, the
 * Events | All | News switch, empty-state text) is worked out here so it always
 * passes WCAG AA. Nothing chosen = the feed looks exactly as it always has.
 *
 * Output is CSS custom properties (HSL components, like the tokens in
 * styles.css) so the existing components re-colour without new props.
 */
import type { CSSProperties } from "react";
import { buttonTone, contrast, feedBrandPalette, FEED_CARD_LIGHT, luminance, parseColor, type RGB } from "./feedBrandColor";

/** Stored in branding_config: a hex colour, "brand" (follow the feed colour), or nothing (default). */
export type SurfaceChoice = string | null | undefined;

export interface SurfacePreset { value: string; label: string }

export const DEFAULT_TOP_BAR = "#FFFFFF";
/** Matches --feed-background (210 11% 15%) in styles.css. */
export const DEFAULT_BACKGROUND = "#22272B";

export const TOP_BAR_PRESETS: SurfacePreset[] = [
  { value: DEFAULT_TOP_BAR, label: "White" },
  { value: "#FBF8F2", label: "Cream" },
  { value: "#EEF0F3", label: "Grey" },
  { value: "#0B1522", label: "Ink" },
  { value: "brand", label: "Feed colour" },
];

export const BACKGROUND_PRESETS: SurfacePreset[] = [
  { value: DEFAULT_BACKGROUND, label: "Charcoal" },
  { value: "#0B1522", label: "Navy" },
  { value: "#121214", label: "Black" },
  { value: "#F1ECE2", label: "Paper" },
  { value: "#E9ECF0", label: "Light grey" },
];

const INK: RGB = [11, 21, 34]; // workspace/feed navy ink
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [22, 163, 74];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;
}

function adjustUntil(color: RGB, bg: RGB, ratio: number, toward: RGB): RGB {
  let out = color;
  for (let t = 0; t <= 1.0001 && contrast(out, bg) < ratio; t += 0.05) out = mix(color, toward, t);
  return out;
}

/** RGB → "h s% l%" for hsl(var(--token)). */
export function hslTriplet([r, g, b]: RGB): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return `${Math.round(h * 10) / 10} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

export function isCustomSurface(choice: SurfaceChoice): boolean {
  return choice === "brand" || parseColor(choice ?? null) !== null;
}

/** The actual colour of a surface choice, or the fallback when unset/unreadable. */
export function resolveSurface(choice: SurfaceChoice, brand: string | null | undefined, fallback: string): RGB {
  if (choice === "brand") return feedBrandPalette(brand).light.fill;
  return parseColor(choice ?? null) ?? parseColor(fallback)!;
}

/** Ink or white, whichever reads better, pushed towards pure black/white for 7:1 where the surface allows. */
function inkFor(surface: RGB): RGB {
  const light = contrast(WHITE, surface) >= contrast(INK, surface);
  return adjustUntil(light ? WHITE : INK, surface, 7, light ? WHITE : [0, 0, 0]);
}

const isLightInk = (ink: RGB) => luminance(ink) > 0.5;

export interface TopBarTones {
  bar: RGB;
  /** Feed name, button labels and icons — ≥ 4.5:1 always, 7:1 wherever the bar allows */
  text: RGB;
  /** Welcome line — ≥ 4.5:1 */
  muted: RGB;
  /** Subscribe / menu button fill — visibly separate from the bar */
  button: RGB;
  border: RGB;
  /** Feed name accent when shown as text — ≥ 4.5:1 */
  accent: RGB;
  accentFill: RGB;
  onAccentFill: RGB;
  /** Live pill text and dot — ≥ 4.5:1 */
  live: RGB;
}

export function topBarTones(bar: RGB, brand: string | null | undefined): TopBarTones {
  const text = inkFor(bar);
  const dark = isLightInk(text);
  const muted = adjustUntil(mix(text, bar, 0.35), bar, 4.5, text);
  // Buttons step away from the label colour (so labels gain contrast) when the bar allows,
  // otherwise towards it (white bars get the familiar soft grey button).
  const away: RGB = dark ? [0, 0, 0] : WHITE;
  const step = (toward: RGB) => {
    let out = bar;
    for (let t = 0.07; t <= 0.4001 && contrast(out, bar) < 1.12; t += 0.01) out = mix(bar, toward, t);
    return out;
  };
  let button = step(away);
  if (contrast(button, bar) < 1.12 || contrast(text, button) < 4.5) button = step(text);
  const border = mix(bar, text, dark ? 0.22 : 0.14);
  const base = parseColor(brand) ?? INK;
  const accent = adjustUntil(base, bar, 4.5, text);
  const { fill: accentFill, onFill: onAccentFill } = buttonTone(accent);
  const live = adjustUntil(GREEN, bar, 4.5, text);
  return { bar, text, muted, button, border, accent, accentFill, onAccentFill, live };
}

export interface BackgroundTones {
  background: RGB;
  /** Headings and links straight on the background — ≥ 4.5:1 always, 7:1 wherever possible */
  text: RGB;
  /** Empty-state lines, footer link — ≥ 4.5:1 */
  muted: RGB;
  /** Outline of the Events | All | News pill (a story-card surface) — ≥ 1.5:1 against the background */
  toggleBorder: RGB;
}

export function backgroundTones(background: RGB): BackgroundTones {
  const text = inkFor(background);
  const muted = adjustUntil(mix(text, background, 0.3), background, 4.5, text);
  // The pill is card-white like the stories: on light pages give it a clear outline.
  const toggleBorder = contrast(FEED_CARD_LIGHT, background) >= 1.5
    ? mix(FEED_CARD_LIGHT, background, 0.5)
    : adjustUntil(mix(background, INK, 0.2), background, 1.5, INK);
  return { background, text, muted, toggleBorder };
}

export interface FeedSurfaceInput {
  topBar?: SurfaceChoice;
  background?: SurfaceChoice;
  brand?: string | null | undefined;
}

export interface FeedSurfaceStyles {
  /** True when the owner picked a top bar colour (use the computed Live pill). */
  customTopBar: boolean;
  customBackground: boolean;
  topBar: TopBarTones;
  backgroundTones: BackgroundTones;
  /** On the feed's outermost element. */
  root: CSSProperties | undefined;
  /** On the top banner and the sticky header (add text-foreground so text re-colours). */
  header: CSSProperties | undefined;
}

const v = (c: RGB) => hslTriplet(c);

export function feedSurfaceStyles({ topBar, background, brand }: FeedSurfaceInput): FeedSurfaceStyles {
  const customTopBar = isCustomSurface(topBar);
  const customBackground = isCustomSurface(background);
  const bar = topBarTones(resolveSurface(topBar, brand, DEFAULT_TOP_BAR), brand);
  const bg = backgroundTones(resolveSurface(background, brand, DEFAULT_BACKGROUND));

  const header = customTopBar
    ? ({
        "--background": v(bar.bar),
        "--foreground": v(bar.text),
        "--muted": v(bar.button),
        "--muted-foreground": v(bar.muted),
        "--border": v(bar.border),
        "--primary": v(bar.accent),
        "--primary-foreground": v(bar.onAccentFill),
        "--feed-header-background": v(bar.bar),
        "--feed-live": v(bar.live),
      } as CSSProperties)
    : undefined;

  const root = customBackground || customTopBar
    ? ({
        ...(customBackground
          ? {
              "--feed-background": v(bg.background),
              "--feed-on-background": v(bg.text),
              "--feed-on-background-muted": v(bg.muted),
              "--feed-toggle-border": v(bg.toggleBorder),
            }
          : {}),
        ...(customTopBar ? { "--feed-header-background": v(bar.bar) } : {}),
      } as CSSProperties)
    : undefined;

  return { customTopBar, customBackground, topBar: bar, backgroundTones: bg, root, header };
}

/** Live pill classes: the usual green (blue while updating), or one contrast-picked colour on an owner-chosen top bar. */
export function livePillTone(customTopBar: boolean, refreshing = false): { pill: string; ping: string; dot: string } {
  if (customTopBar) return { pill: "bg-feed-live/10 text-feed-live border-feed-live/25", ping: "bg-feed-live", dot: "bg-feed-live" };
  if (refreshing) return { pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", ping: "bg-blue-400", dot: "bg-blue-500" };
  return { pill: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", ping: "bg-green-400", dot: "bg-green-500" };
}
