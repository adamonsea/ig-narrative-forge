import {
  ANIMATION_CREDIT_COSTS,
  AUDIO_BRIEFING_CREDIT_COST,
  IMAGE_CREDIT_COSTS,
  PRO_MONTHLY_CREDITS,
  PRO_PRICE,
  REEL_CREDIT_COST,
  SATIRICAL_IMAGE_CREDIT_COST,
  TOP_UP_CREDITS,
  TOP_UP_PRICE_USD,
} from './billing';

/** Default illustration quality used when a curator generates an image. */
export const STANDARD_ILLUSTRATION_CREDITS = IMAGE_CREDIT_COSTS['gpt-image-2-medium'];

/** Monthly Pro cost (USD) for a number of illustrations, buying top-ups for anything over the allowance. */
export function monthlyCostForIllustrations(illustrations: number, creditsEach = STANDARD_ILLUSTRATION_CREDITS): number {
  const extraCredits = Math.max(0, illustrations * creditsEach - PRO_MONTHLY_CREDITS);
  const topUps = Math.ceil(extraCredits / TOP_UP_CREDITS);
  return PRO_PRICE.month + topUps * TOP_UP_PRICE_USD;
}

export interface ScaleRow { perDay: number; perMonth: number; cost: number; firstRow: boolean }

/** Steps follow each extra top-up, so every row is a real price point. */
export function scalingRows(): ScaleRow[] {
  const included = Math.floor(PRO_MONTHLY_CREDITS / STANDARD_ILLUSTRATION_CREDITS);
  const perTopUp = Math.floor(TOP_UP_CREDITS / STANDARD_ILLUSTRATION_CREDITS);
  const months = [included, included + perTopUp, included + 2 * perTopUp, included + 3 * perTopUp, 1000];
  return months.map((perMonth, i) => ({
    perDay: Math.round(perMonth / 30),
    perMonth,
    cost: monthlyCostForIllustrations(perMonth),
    firstRow: i === 0,
  }));
}

export const CREDIT_PRICE_LIST = [
  { use: 'Standard illustration', credits: STANDARD_ILLUSTRATION_CREDITS },
  { use: 'Quick illustration', credits: IMAGE_CREDIT_COSTS['gpt-image-2-low'] },
  { use: 'Premium illustration', credits: IMAGE_CREDIT_COSTS['gpt-image-2-high'] },
  { use: 'Satirical cartoon', credits: SATIRICAL_IMAGE_CREDIT_COST },
  { use: 'Social reel', credits: REEL_CREDIT_COST },
  { use: 'Short animation', credits: ANIMATION_CREDIT_COSTS.fast },
  { use: 'Audio briefing', credits: AUDIO_BRIEFING_CREDIT_COST },
].map((row) => ({ ...row, perAllowance: Math.floor(PRO_MONTHLY_CREDITS / row.credits) }));
