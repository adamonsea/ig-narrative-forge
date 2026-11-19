/** A donation tier as the owner edits it. */
export interface DonationTier {
  name: string;
  amount: string;
  stripe_payment_link: string;
  description?: string | undefined;
}

/** Only Stripe Payment Links are accepted as the pay link. */
export function isStripePaymentLink(url: string): boolean {
  const u = url.trim();
  return u.startsWith("https://buy.stripe.com/") || u.startsWith("https://checkout.stripe.com/");
}

/**
 * Tiers that are safe to show readers: name, amount and a Stripe Payment Link all filled in.
 * Auto-save stores only these, so a half-typed tier never reaches the feed.
 */
export function publishableTiers(tiers: DonationTier[]): DonationTier[] {
  return tiers
    .filter((t) => t.name.trim() && t.amount.trim() && isStripePaymentLink(t.stripe_payment_link))
    .map((t) => ({ ...t, name: t.name.trim(), amount: t.amount.trim(), stripe_payment_link: t.stripe_payment_link.trim() }));
}
