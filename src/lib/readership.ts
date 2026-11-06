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
