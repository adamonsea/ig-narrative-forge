// @ts-nocheck -- vendored card-pack-reveal skill; written for looser compiler settings
import { STACK_OFFSETS_Y, STACK_REVEALED_Y, REVEAL_STAGGER } from "./constants";

export interface FanLayoutInput {
  index: number;
  active: number;
  total: number;
  /** Reveal beat (0..8). <2 sleeve idle, 2 lift, 3 sleeve drop, 5 settle, 7 fan, 8 idle. */
  revealBeat: number;
  /** Live horizontal swipe delta (only meaningful at fan stage). */
  dragX: number;
  cardWidth: number;
}

export type FanLayoutMode = "stack" | "lifted" | "revealed" | "fan";

export interface FanLayoutResult {
  offset: number;
  absOffset: number;
  isCenter: boolean;
  stackIdx: number;
  tx: number;
  ty: number;
  rot: number;
  scale: number;
  opacity: number;
  rotY: number;
  delayMs: number;
  mode: FanLayoutMode;
}

/**
 * Pure layout math for one card in the unified RevealStage.
 * See references/beats.md for the full beat table.
 */
export function computeFanLayout(input: FanLayoutInput): FanLayoutResult {
  const { index, active, total, revealBeat, dragX, cardWidth } = input;

  let offset = index - active;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  const absOffset = Math.abs(offset);
  const isCenter = index === active;

  const stackIdx = Math.min(
    STACK_OFFSETS_Y.length - 1,
    Math.max(0, absOffset * 2 + (offset < 0 ? 1 : 0))
  );

  let tx = 0;
  let ty = 0;
  let rot = 0;
  let scale = 1;
  let opacity = 1;
  let rotY = 0;
  let delayMs = 0;
  let mode: FanLayoutMode;

  if (revealBeat >= 7) {
    mode = "fan";
    const spread = Math.min(cardWidth * 0.22, 96);
    if (isCenter) {
      tx = offset * spread + dragX;
      rot = offset * 5 + dragX * 0.015;
      rotY = Math.max(-5, Math.min(5, dragX * 0.04));
      scale = 1;
    } else {
      const followFactor =
        absOffset === 1 ? 0.18 : absOffset === 2 ? 0.06 : 0.03;
      const offsetSpread =
        absOffset <= 2 ? offset * spread : Math.sign(offset) * (2 * spread + spread * 0.7);
      tx = offsetSpread + dragX * followFactor;
      rot = absOffset <= 2 ? offset * 5 : Math.sign(offset) * 13;
      scale = 1 - absOffset * 0.06;
    }
    opacity = absOffset > 3 ? 0 : absOffset === 3 ? 0.5 : 1;
  } else if (revealBeat >= 5) {
    mode = "revealed";
    ty = STACK_REVEALED_Y[stackIdx];
    tx = offset * 4;
    rot = offset * 0.6;
    scale = 1 - absOffset * 0.03;
    opacity = absOffset > 2 ? 0 : 1;
    delayMs = REVEAL_STAGGER[stackIdx] ?? 0;
  } else if (revealBeat >= 2) {
    if (isCenter) {
      mode = "lifted";
      ty = -120;
      scale = 1.02;
    } else {
      mode = "stack";
      ty = STACK_OFFSETS_Y[stackIdx];
      scale = 1 - absOffset * 0.03;
    }
    opacity = 1;
  } else {
    mode = "stack";
    ty = isCenter ? 0 : STACK_OFFSETS_Y[stackIdx];
    scale = isCenter ? 1 : 1 - absOffset * 0.03;
    opacity = 1;
  }

  return { offset, absOffset, isCenter, stackIdx, tx, ty, rot, scale, opacity, rotY, delayMs, mode };
}
