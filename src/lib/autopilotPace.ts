// Autopilot pace: three plain choices mapped onto the existing release settings.

export type Pace = 'now' | 'spread' | 'twice';

export interface PaceFields {
  drip_feed_enabled: boolean;
  drip_release_interval_hours?: number;
  drip_stories_per_release?: number;
  drip_start_hour?: number;
  drip_end_hour?: number;
}

export const PACE_LABELS: Record<Pace, { label: string; hint: string }> = {
  now: { label: 'As soon as ready', hint: 'Each story goes live the moment it is written.' },
  spread: { label: 'Through the day', hint: 'A couple of stories every three hours, early morning to late evening.' },
  twice: { label: 'Twice a day', hint: 'Two batches a day: early morning and mid-afternoon.' },
};

export function paceFields(pace: Pace): PaceFields {
  if (pace === 'now') return { drip_feed_enabled: false };
  if (pace === 'spread') return { drip_feed_enabled: true, drip_release_interval_hours: 3, drip_stories_per_release: 2, drip_start_hour: 6, drip_end_hour: 22 };
  return { drip_feed_enabled: true, drip_release_interval_hours: 8, drip_stories_per_release: 4, drip_start_hour: 7, drip_end_hour: 23 };
}

/** Which plain choice matches the stored settings; null means a custom pace set in More options. */
export function paceOf(f: PaceFields): Pace | null {
  if (!f.drip_feed_enabled) return 'now';
  for (const pace of ['spread', 'twice'] as Pace[]) {
    const p = paceFields(pace);
    if (
      f.drip_release_interval_hours === p.drip_release_interval_hours &&
      f.drip_stories_per_release === p.drip_stories_per_release &&
      f.drip_start_hour === p.drip_start_hour &&
      f.drip_end_hour === p.drip_end_hour
    ) return pace;
  }
  return null;
}
