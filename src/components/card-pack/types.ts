import { type ReactNode } from "react";

export interface CardPackSection {
  /** Stable id used as React key and returned to `onActivate`. */
  slug: string;
  /** "Chapter one. The basics." — first sentence is kicker, rest becomes subtitle. */
  kicker: string;
  /** Big serif title on the card. */
  title: string;
  /** Cover slot — any JSX, ideally square-ish. */
  cover: ReactNode;
  /** Optional pill rendered top-right of the card. */
  badge?: string;
  /** Free-form metadata passed back via `onActivate` and `detailRenderer`. */
  meta?: Record<string, unknown>;
}

export interface CardPackTheme {
  bg: string;
  sleeveFill: string;
  sleeveText: string;
  cardSurface: string;
  cardBorder: string;
  accent: string;
  accentText: string;
  title: string;
  muted: string;
  hairline: string;
  radius: number | string;
  serif: string;
  mono: string;
}

export interface CardPackSleeveConfig {
  logo?: ReactNode;
  tagline?: string;
  openLabel?: string;
}

/**
 * Beat → milliseconds to wait BEFORE moving to the next beat in the
 * forward sequence. The reverse sequence plays the same beats in reverse
 * order with the same delays, guaranteeing motion symmetry.
 *
 * Defaults (ms): 1→200, 2→200, 3→220, 4→100, 5→420, 6→220, 7→900.
 * Override individual beats by passing a partial map.
 */
export type BeatTimings = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>>;

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export type EdgeBehaviour = "wrap" | "clamp" | "rubber";

export interface RenderSleeveContext {
  openLabel: string;
  /** Trigger the reveal. Idempotent. */
  onOpen: () => void;
  /** Current beat (0..8) — useful for staging sleeve internals. */
  beat: number;
}

export interface CardPackProps {
  sections: CardPackSection[];

  /** Sleeve cover content for the built-in sleeve. Ignored if `renderSleeve` is provided. */
  sleeve?: CardPackSleeveConfig;

  /** Replace the sleeve body entirely (logo + tagline + CTA). Background, notch and drop animation stay built-in. */
  renderSleeve?: (ctx: RenderSleeveContext) => ReactNode;

  /** Decorative layer rendered behind the sleeve body (noise, foil, grain). */
  sleeveTexture?: ReactNode;

  /** Header rendered above the fan once it settles. */
  header?: ReactNode;
  /** Footer rendered below the dots. */
  footer?: ReactNode;

  /** Theme overrides — written inline as CSS vars on the root. See theming.md. */
  theme?: Partial<CardPackTheme>;

  renderCard?: (
    section: CardPackSection,
    ctx: { isCenter: boolean; index: number; active: number }
  ) => ReactNode;

  onActivate?: (section: CardPackSection, index: number) => void;
  detailRenderer?: (section: CardPackSection, close: () => void) => ReactNode;
  onClose?: () => void;

  reduceMotion?: "auto" | "always" | "never";
  initialState?: "closed" | "open";

  showDots?: boolean;
  showCloseButton?: boolean;
  /** First-visit swipe hint overlay. Defaults to true. */
  showSwipeHint?: boolean;

  /** Animated gradient sheen on the active card. Default false (subtle but optional). */
  sheen?: boolean;

  /** Width/height ratio of the sleeve. Default 300/480 (≈0.625, portrait playing card). */
  aspect?: number;

  /** Override individual beat delays (ms). See BeatTimings. */
  beats?: BeatTimings;

  /** Override the spring used for card motion. Defaults to `{ stiffness: 120, damping: 22, mass: 1 }`. */
  spring?: SpringConfig;

  /** What happens when the user tries to swipe past the deck ends. Default "wrap". */
  edgeBehaviour?: EdgeBehaviour;

  /** Fired on every beat transition. Use for analytics / sound / haptics. */
  onBeat?: (beat: number) => void;
  /** Fired when the pack finishes opening (beat 8). */
  onOpen?: () => void;
  /** Fired when the active card changes (after a swipe or programmatic change). */
  onSettle?: (section: CardPackSection, index: number) => void;
}
