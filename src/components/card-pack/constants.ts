import type { BeatTimings, SpringConfig } from "./types";

export const STACK_OFFSETS_Y = [-60, -40, 0, -20, -10];
export const STACK_REVEALED_Y = [-56, -42, 0, -28, -14];
export const REVEAL_STAGGER = [160, 80, 0, 40, 120];
export const REVEAL_EASE = [0.4, 0, 0.2, 1] as [number, number, number, number];

/** Default ms-delay AFTER moving to each beat, before moving on. */
export const DEFAULT_BEATS: Required<BeatTimings> = {
  1: 200,
  2: 200,
  3: 220,
  4: 100,
  5: 420,
  6: 220,
  7: 900,
};

export const DEFAULT_SPRING: Required<SpringConfig> = {
  stiffness: 120,
  damping: 22,
  mass: 1,
};

/** Slightly under-damped spring used for the initial fan-settle overshoot. */
export const FAN_SETTLE_SPRING: Required<SpringConfig> = {
  stiffness: 140,
  damping: 14,
  mass: 1,
};

/** Weighty drop for the sleeve coming off the deck. */
export const SLEEVE_DROP_SPRING = {
  type: "spring" as const,
  stiffness: 90,
  damping: 16,
  mass: 1.4,
};
