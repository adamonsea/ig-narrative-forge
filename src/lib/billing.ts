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

export const IMAGE_CREDIT_COSTS = {
  'gpt-image-2-low': 1,
  'gpt-image-2-medium': 5,
  'gpt-image-2-high': 17,
} as const;
