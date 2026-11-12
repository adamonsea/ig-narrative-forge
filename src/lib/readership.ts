/** Weekly readers needed before the funnel and headline stop rates are shown. */
export const MEANINGFUL_READERS = 20;

/** Week-on-week change in reads; null when there's no prior week to compare or no change. */
export function readershipChange(thisWeek: number, lastWeek: number) {
  if (lastWeek <= 0 || thisWeek === lastWeek) return null;
  const percent = Math.round((Math.abs(thisWeek - lastWeek) / lastWeek) * 100);
  if (percent === 0) return null;
  return { direction: thisWeek > lastWeek ? ("up" as const) : ("down" as const), percent };
}

/** Bar heights (0–100) for the 7-day chart; days with reads always show a sliver. */
export function barHeights(daily: number[]) {
  const max = Math.max(0, ...daily);
  if (max === 0) return daily.map(() => 0);
  return daily.map((n) => (n <= 0 ? 0 : Math.max(4, Math.round((n / max) * 100))));
}

/** One floor everywhere a story gets scored: distinct outside readers who saw it (Readership, card, widget shelf, any future boost). */
export const STORY_SCORE_FLOOR = 30;
/** Outside reader-days needed before the scroll drop-off curve appears. */
export const DROPOFF_MIN_SESSIONS = 30;

export interface Dropoff { sessions: number; reached: number[] }
export interface TopStopper { id: string; title: string; image?: string | null; seen: number; stop_rate: number; expected_rate: number; score: number }

/** Share (0–100) of readers who reached each card, plus the card most readers stop before. Null below the floor. */
export function dropoffCurve(d: Dropoff | null | undefined) {
  const sessions = Number(d?.sessions) || 0;
  if (!d || sessions < DROPOFF_MIN_SESSIONS || !d.reached?.length) return null;
  const percents = d.reached.map((n) => Math.round((Number(n) / sessions) * 100));
  const half = percents.findIndex((p) => p < 50);
  return { percents, halfGoneBy: half === -1 ? null : half + 1 };
}

/** Top headline stopper: only when it has enough readers and genuinely beats what its feed spot usually gets. */
export function topStopper(s: TopStopper | null | undefined) {
  if (!s || Number(s.seen) < STORY_SCORE_FLOOR) return null;
  const rate = Number(s.stop_rate), expected = Number(s.expected_rate);
  if (!(rate > 0) || !(expected > 0)) return null;
  const times = rate / expected;
  if (times < 1.1) return null;
  return { ...s, ratePercent: Math.round(rate * 100), times: Math.round(times * 10) / 10 };
}

export interface StorySignalInput { seen?: number | null; stop_rate?: number | null; swipe_rate?: number | null }

/** Hook vs hold for one story: % of readers who saw it that stopped, and % that swiped in. Null below the story floor. */
export function storySignal(s: StorySignalInput | null | undefined) {
  if (!s || Number(s.seen) < STORY_SCORE_FLOOR || s.stop_rate == null || s.swipe_rate == null) return null;
  return { stopped: Math.round(Number(s.stop_rate) * 100), swiped: Math.round(Number(s.swipe_rate) * 100) };
}
