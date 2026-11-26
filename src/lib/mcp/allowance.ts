// Pure rules for Studio write tools (Phase 2). Kept separate so they can be tested.

/** Bump when a new kind of access is added; older connections must be approved again. */
export const STUDIO_GRANT_VERSION = 1;
/** First grant version that allows changes to feeds. */
export const STUDIO_WRITE_VERSION = 2;

export type WriteKind = "setup" | "image" | "publish";

export interface OwnerStatus {
  is_pro?: boolean;
  exempt?: boolean;
  balance?: number;
  today_credits?: number;
  daily_cap?: number;
  trial_over?: boolean;
}

export type Decision = { ok: true } | { ok: false; reason: string };

/** Free can set up within the existing free caps; pictures need credits; publishing is the paywall. */
export function allowanceDecision(status: OwnerStatus | null, kind: WriteKind, credits = 1): Decision {
  if (!status) return { ok: false, reason: "We couldn't read your account. Try again." };
  if (status.exempt) return { ok: true };
  if (kind === "setup") return { ok: true };
  if (kind === "image") {
    if ((status.balance ?? 0) < credits) return { ok: false, reason: "You're out of credits. Top up or move to Curatr Pro." };
    if ((status.today_credits ?? 0) + credits > (status.daily_cap ?? 0)) {
      return { ok: false, reason: "You've reached today's picture limit. It resets tomorrow." };
    }
    return { ok: true };
  }
  if (status.is_pro || !status.trial_over) return { ok: true };
  return { ok: false, reason: "Your free trial has ended. Move to Curatr Pro to publish." };
}

export function grantAllowsWrites(version: number | null | undefined): boolean {
  return (version ?? 0) >= STUDIO_WRITE_VERSION;
}
