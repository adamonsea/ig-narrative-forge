// @ts-nocheck -- run with: bun test ./src/lib/donationTiers.test.ts
import { describe, expect, it } from "bun:test";
import { publishableTiers } from "./donationTiers";

const tier = (over = {}) => ({ name: "Supporter", amount: "£5/month", stripe_payment_link: "https://buy.stripe.com/abc", ...over });

describe("donation tiers that reach readers", () => {
  it("a complete tier with a Stripe Payment Link is kept", () => {
    expect(publishableTiers([tier()])).toHaveLength(1);
  });
  it("a tier without an amount is not saved for readers", () => {
    expect(publishableTiers([tier({ amount: "" })])).toHaveLength(0);
  });
  it("a non-Stripe pay link is not saved for readers", () => {
    expect(publishableTiers([tier({ stripe_payment_link: "https://paypal.me/x" })])).toHaveLength(0);
  });
});
