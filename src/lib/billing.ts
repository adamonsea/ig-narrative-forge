export const BILLING_COPY = {
  freeLabel: 'Free',
  proLabel: 'Pro',
  privateNote: 'Your feed stays private until you publish.',
  distributionTitle: 'Ready to share this feed?',
  distributionBody: 'Pro unlocks publishing and every distribution channel.',
  trialCredits: 'You have enough credits to try your first premium image.',
  freeNoCredits: 'You’ve used your trial credits. Pro includes a monthly creative allowance.',
  proNoCredits: 'Add credits to keep creating.',
} as const;

export const PRO_PRICE = { month: 19, year: 190 } as const;
export const PRO_MONTHLY_CREDITS = 500;
export const WELCOME_CREDITS = 20;
export const TOP_UP_CREDITS = 500;

/** Unified rate card: 1 credit = 2¢, priced at ~50% gross margin. */
export const IMAGE_CREDIT_COSTS = {
  'gpt-image-2-low': 1,
  'gpt-image-2-medium': 4,
  'gpt-image-2-high': 17,
} as const;

export const ANIMATION_CREDIT_COSTS = { fast: 8, standard: 50 } as const;
export const REEL_CREDIT_COST = 5;
export const AUDIO_BRIEFING_CREDIT_COST = 30;
