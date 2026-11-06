/** Reads needed today before "best day this month" can fire. */
export const BEST_DAY_MIN_READS = 20;
/** All-time reader tiers worth a quiet celebration. */
export const READER_MILESTONES = [100, 500, 1000, 5000, 10000];
/** How often the Desk pulse refreshes while open. */
export const PULSE_POLL_MS = 30_000;

export interface PulseFigures {
  readers_all_time: number;
  reads_today: number;
  best_other_day_30: number;
  dismissed: string[];
}

export interface Milestone {
  key: string;
  text: string;
}

/** Pick at most one undismissed milestone. Best day beats reader tiers. */
export function pickMilestone(p: PulseFigures, today: string): Milestone | null {
  const dismissed = new Set(p.dismissed);
  if (
    p.reads_today >= BEST_DAY_MIN_READS &&
    p.reads_today > p.best_other_day_30 &&
    !dismissed.has(`best_day_${today}`)
  ) {
    return { key: `best_day_${today}`, text: `Best day this month — ${p.reads_today} reads so far today.` };
  }
  const tier = [...READER_MILESTONES].reverse().find((t) => p.readers_all_time >= t);
  if (tier && !dismissed.has(`readers_${tier}`)) {
    return { key: `readers_${tier}`, text: `Your feed has passed ${tier.toLocaleString()} readers.` };
  }
  return null;
}
