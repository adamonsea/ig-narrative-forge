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

export const PLANS: Record<string, PlanDef> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceId: 'price_1UH7pXEc632ZWfk7z5SnTP5x',
    annualPriceId: 'price_1UH84FEc632ZWfk72zabxFct',
    amountCents: 1900,
    annualAmountCents: 19000,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceId: 'price_1UH7pYEc632ZWfk7ecaG8aAW',
    annualPriceId: 'price_1UH84GEc632ZWfk7wUXmu09C',
    amountCents: 4900,
    annualAmountCents: 49000,
  },
  team: {
    id: 'team',
    name: 'Team',
    priceId: 'price_1UH7pZEc632ZWfk74Me6Lldh',
    annualPriceId: 'price_1UH84IEc632ZWfk7BZcbyk2v',
    amountCents: 14900,
    annualAmountCents: 149000,
  },
};

export function planById(id: string | null | undefined): PlanDef | null {
  if (!id) return null;
  return PLANS[id.toLowerCase()] ?? null;
}

export function priceIdFor(plan: PlanDef, interval: BillingInterval): string {
  return interval === 'year' ? plan.annualPriceId : plan.priceId;
}

export function planByPriceId(priceId: string | null | undefined): PlanDef | null {
  if (!priceId) return null;
  return (
    Object.values(PLANS).find((p) => p.priceId === priceId || p.annualPriceId === priceId) ?? null
  );
}
