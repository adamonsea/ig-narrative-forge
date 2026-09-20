// Curatr paid plans, mapped to the Stripe prices created for the account.
// Annual billing is priced at 10x the monthly rate (two months free).
export type BillingInterval = 'month' | 'year';

export interface PlanDef {
  id: string;
  name: string;
  priceId: string; // monthly
  annualPriceId: string;
  amountCents: number; // monthly
  annualAmountCents: number;
}

export const MONTHLY_PRO_CREDITS = 500;
export const WELCOME_CREDITS = 20;
export const TOP_UP_CREDITS = 500;
export const TOP_UP_PRICE_ID = 'price_1UHoQqEc632ZWfk7Y42qSyMy';

export const PLANS: Record<string, PlanDef> = {
  pro: {
    id: 'pro',
    name: 'Pro',
    priceId: 'price_1UHoOnEc632ZWfk7msX20fz0',
    annualPriceId: 'price_1UHoOoEc632ZWfk7vV1WVN1N',
    amountCents: 1900,
    annualAmountCents: 19000,
  },
};

const LEGACY_PRICE_IDS = new Set([
  'price_1UH7pXEc632ZWfk7z5SnTP5x', 'price_1UH84FEc632ZWfk72zabxFct',
  'price_1UH7pYEc632ZWfk7ecaG8aAW', 'price_1UH84GEc632ZWfk7wUXmu09C',
  'price_1UH7pZEc632ZWfk74Me6Lldh', 'price_1UH84IEc632ZWfk7BZcbyk2v',
]);

export function planById(id: string | null | undefined): PlanDef | null {
  if (!id) return null;
  const normalized = id.toLowerCase();
  return normalized === 'starter' || normalized === 'team' ? PLANS.pro : PLANS[normalized] ?? null;
}

export function priceIdFor(plan: PlanDef, interval: BillingInterval): string {
  return interval === 'year' ? plan.annualPriceId : plan.priceId;
}

export function planByPriceId(priceId: string | null | undefined): PlanDef | null {
  if (!priceId) return null;
  if (LEGACY_PRICE_IDS.has(priceId)) return PLANS.pro;
  return (
    Object.values(PLANS).find((p) => p.priceId === priceId || p.annualPriceId === priceId) ?? null
  );
}
