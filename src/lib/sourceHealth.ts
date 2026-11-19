/**
 * Source health on the Sources tab, judged against each source's own rhythm.
 *
 *   failing (red)  – the last 3+ reads failed, or nothing has arrived in 14 days
 *   quiet (amber)  – silent for 2.5× its usual gap between arrival days (and 2+ days),
 *                    or, with too little history to know its rhythm, a week or more
 *   new (neutral)  – added under 3 days ago and nothing yet
 *   healthy (green)– otherwise
 *
 * Events sources: failing when the last two checks found nothing (the link may have
 * moved), quiet when nothing of theirs is coming up, healthy otherwise.
 *
 * Pure, so the rules are tested and the same everywhere.
 */
export type SourceHealth = "healthy" | "quiet" | "failing" | "new";

export const FAILURES_FOR_RED = 3;
export const SILENT_DAYS_FOR_RED = 14;
export const QUIET_GAP_MULTIPLIER = 2.5;
export const NEW_SOURCE_DAYS = 3;
const MIN_QUIET_DAYS = 2;
const FALLBACK_QUIET_DAYS = 7;

const DAY = 86_400_000;
const utc = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);
const londonDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Median gap in days between consecutive arrival days; null with fewer than 3 arrival days. */
export function typicalGapDays(arrivalDays: string[]): number | null {
  const days = [...new Set(arrivalDays.map((d) => d.slice(0, 10)))].sort();
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i]!, d)).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return (gaps.length % 2 ? gaps[mid] : (gaps[mid - 1]! + gaps[mid]!) / 2)!;
}

export interface NewsHealthInput {
  consecutiveFailures?: number | null | undefined;
  arrivalDays: string[];
  lastArrivalAt?: string | null | undefined;
  addedAt?: string | null | undefined;
  today: string; // YYYY-MM-DD, London
}

export interface HealthVerdict {
  health: SourceHealth;
  /** One plain sentence for the panel. */
  reason: string;
  /** Short label for the card when it needs a look. */
  label: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function rhythmSentence(gap: number | null): string | null {
  if (gap === null) return null;
  if (gap <= 1) return "Usually something every day";
  return `Usually something every ${Math.round(gap)} days`;
}

export function newsSourceHealth(i: NewsHealthInput): HealthVerdict {
  const fails = Number(i.consecutiveFailures) || 0;
  if (fails >= FAILURES_FOR_RED) {
    return { health: "failing", label: "Can't be read", reason: `The last ${fails} reads failed. The link may have changed.` };
  }
  const lastDay = i.lastArrivalAt ? londonDay(i.lastArrivalAt) : [...i.arrivalDays].sort().pop() ?? null;
  if (!lastDay) {
    const age = i.addedAt ? daysBetween(londonDay(i.addedAt), i.today) : SILENT_DAYS_FOR_RED;
    if (age >= SILENT_DAYS_FOR_RED) return { health: "failing", label: "Nothing in 14 days", reason: `Nothing has come through since it was added ${plural(age, "day")} ago.` };
    if (age >= NEW_SOURCE_DAYS) return { health: "quiet", label: "Nothing yet", reason: `Added ${plural(age, "day")} ago and nothing has come through yet.` };
    return { health: "new", label: "Just added", reason: "Just added. The first stories usually arrive within a day." };
  }
  const silent = daysBetween(lastDay, i.today);
  if (silent >= SILENT_DAYS_FOR_RED) {
    return { health: "failing", label: `Nothing in ${silent} days`, reason: `Nothing has come through for ${plural(silent, "day")}.` };
  }
  const gap = typicalGapDays(i.arrivalDays);
  const quietAfter = gap === null ? FALLBACK_QUIET_DAYS : Math.max(MIN_QUIET_DAYS, QUIET_GAP_MULTIPLIER * gap);
  if (silent >= quietAfter) {
    const usual = rhythmSentence(gap);
    return {
      health: "quiet",
      label: `Quiet ${plural(silent, "day")}`,
      reason: usual ? `${usual}, but nothing for ${plural(silent, "day")}.` : `Nothing for ${plural(silent, "day")}.`,
    };
  }
  return { health: "healthy", label: "Flowing", reason: rhythmSentence(gap) ?? "Flowing normally." };
}

export interface EventsHealthInput {
  consecutiveEmptyChecks?: number | null | undefined;
  lastCheckedAt?: string | null | undefined;
  upcoming: number;
}

export function eventSourceHealth(i: EventsHealthInput): HealthVerdict {
  if ((Number(i.consecutiveEmptyChecks) || 0) >= 2) {
    return { health: "failing", label: "No events found", reason: "No events found on the last two checks. The link may have moved." };
  }
  if (!i.lastCheckedAt) return { health: "new", label: "Not checked yet", reason: "Not checked yet. It's read twice a day." };
  if (i.upcoming === 0) return { health: "quiet", label: "Nothing coming up", reason: "Nothing from here is in your feed right now." };
  return { health: "healthy", label: "Flowing", reason: `${plural(i.upcoming, "event")} coming up in your feed.` };
}

const RANK: Record<SourceHealth, number> = { failing: 0, quiet: 1, new: 2, healthy: 3 };

/** Sources that need a look first (red, then amber), then the rest by name. */
export function attentionOrder<T extends { health: SourceHealth; name: string }>(a: T, b: T): number {
  return RANK[a.health] - RANK[b.health] || a.name.localeCompare(b.name);
}

export const needsAttention = (h: SourceHealth) => h === "failing" || h === "quiet";
