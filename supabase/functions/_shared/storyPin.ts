/**
 * Story pinning: one story per feed sits at the top for a set time, then drops back
 * to its normal place. Shared by the reader feed, the Desk, the emails and briefings.
 */

/** The only pin lengths an owner can pick (the database accepts these too). */
export const PIN_LENGTHS = [
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 168, label: "7 days" },
] as const;

export interface StoryPin {
  story_id: string | null;
  pinned_at?: string | null;
  pinned_until: string | null;
  /** When a daily email last led with the pinned story. */
  daily_led_at?: string | null;
}

/** The pinned story's id while the pin lasts, else null. */
export function activePinId(pin: StoryPin | null | undefined, now: number = Date.now()): string | null {
  if (!pin?.story_id || !pin.pinned_until) return null;
  return new Date(pin.pinned_until).getTime() > now ? pin.story_id : null;
}

/** "45m left", "18h left", "3 days left". */
export function pinTimeLeft(until: string, now: number = Date.now()): string {
  const ms = Math.max(0, new Date(until).getTime() - now);
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m left`;
  if (hours < 48) return `${Math.floor(hours)}h left`;
  return `${Math.floor(hours / 24)} days left`;
}

/** The pinned item moves to the front; everything else keeps its order. No pin, no change. */
export function withPinnedFirst<T extends { id: string }>(items: T[], pinnedId: string | null | undefined): T[] {
  if (!pinnedId) return items;
  const i = items.findIndex((x) => x.id === pinnedId);
  if (i <= 0) return items;
  return [items[i]!, ...items.slice(0, i), ...items.slice(i + 1)];
}

/**
 * Does the pinned story lead this email?
 * Weekly: yes while the pin lasts. Daily: once per pin (the first daily send after pinning).
 */
export function pinLeadsEmail(pin: StoryPin | null | undefined, type: "daily" | "weekly", now: number = Date.now()): boolean {
  if (!activePinId(pin, now)) return false;
  if (type === "weekly") return true;
  if (!pin!.daily_led_at) return true;
  if (!pin!.pinned_at) return false;
  return new Date(pin!.daily_led_at).getTime() < new Date(pin!.pinned_at).getTime();
}
