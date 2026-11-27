import { describe, expect, it } from "vitest";
import { allowanceDecision, grantAllowsWrites, STUDIO_GRANT_VERSION } from "@/lib/mcp/allowance";

const free = { is_pro: false, exempt: false, balance: 5, today_credits: 0, daily_cap: 20, trial_over: false };

describe("Studio allowance", () => {
  it("lets Free owners set up feeds", () => expect(allowanceDecision({ ...free, trial_over: true }, "setup").ok).toBe(true));
  it("stops pictures at zero credits", () => expect(allowanceDecision({ ...free, balance: 0 }, "image").ok).toBe(false));
  it("stops pictures at the daily cap", () => expect(allowanceDecision({ ...free, today_credits: 20 }, "image").ok).toBe(false));
  it("keeps the paywall at publish after the trial", () => expect(allowanceDecision({ ...free, trial_over: true }, "publish").ok).toBe(false));
  it("lets Free publish during the trial", () => expect(allowanceDecision(free, "publish").ok).toBe(true));
  it("lets Pro publish", () => expect(allowanceDecision({ ...free, is_pro: true, trial_over: true }, "publish").ok).toBe(true));
  it("refuses with no account", () => expect(allowanceDecision(null, "setup").ok).toBe(false));
  it("new consent permits level-2 writes", () => expect(grantAllowsWrites(STUDIO_GRANT_VERSION)).toBe(true));
  it("Phase 1 connections cannot write", () => expect(grantAllowsWrites(1)).toBe(false));
});
