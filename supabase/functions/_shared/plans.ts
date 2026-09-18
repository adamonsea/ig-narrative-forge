// Curatr paid plans, mapped to the Stripe prices created for the live account.
export interface PlanDef {
  id: string;
  name: string;
  priceId: string;
  amountCents: number;
}

export const PLANS: Record<string, PlanDef> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceId: 'price_1UH7pXEc632ZWfk7z5SnTP5x',
    amountCents: 1900,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceId: 'price_1UH7pYEc632ZWfk7ecaG8aAW',
    amountCents: 4900,
  },
  team: {
    id: 'team',
    name: 'Team',
    priceId: 'price_1UH7pZEc632ZWfk74Me6Lldh',
    amountCents: 14900,
  },
};

export function planById(id: string | null | undefined): PlanDef | null {
  if (!id) return null;
  return PLANS[id.toLowerCase()] ?? null;
}

export function planByPriceId(priceId: string | null | undefined): PlanDef | null {
  if (!priceId) return null;
  return Object.values(PLANS).find((p) => p.priceId === priceId) ?? null;
}
