/**
 * When the "+" add-to-calendar badge on an event card plays its settle-in motion.
 * Readers get the point quickly, so it plays on the first two cards, then every fifth
 * card through about the first dozen, then every twentieth. Other cards show the badge still.
 * `n` is the card's 1-based order among event cards shown in this visit.
 */
export function animatesCalendarHint(n: number): boolean {
  if (n < 1) return false;
  if (n <= 2) return true;
  if (n <= 12) return n % 5 === 1; // 6, 11
  return (n - 11) % 20 === 0; // 31, 51, 71…
}

let shown = 0;
/** Counts one more event card in this visit and says whether its badge animates. */
export function nextCalendarHint(): boolean {
  shown += 1;
  return animatesCalendarHint(shown);
}
