/** Weekly readers needed before the funnel and headline stop rates are shown. */
export const MEANINGFUL_READERS = 20;

/** Week-on-week change in reads; null when there's no prior week to compare or no change. */
export function readershipChange(thisWeek: number, lastWeek: number) {
  if (lastWeek <= 0 || thisWeek === lastWeek) return null;
  const percent = Math.round((Math.abs(thisWeek - lastWeek) / lastWeek) * 100);
  if (percent === 0) return null;
  return { direction: thisWeek > lastWeek ? ("up" as const) : ("down" as const), percent };
}
