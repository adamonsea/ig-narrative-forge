/**
 * The one reader definition, mirrored from the database (topic_engagement / topic_reads /
 * topic_reading_now) so the rule is written down and tested. The database is the only source of figures.
 *
 * Read signal: a swipe past slide 1, a 3s+ headline stop, or 10s+ on a story page, from a person who is
 * not the owner, the preview or a test browser. A person is the visitor ID without its prefix.
 */
export type SignalKind = 'swipe' | 'page_dwell' | 'headline' | 'page_load' | 'source_click' | 'share_click';

export interface Signal {
  visitorId: string;
  storyId: string | null;
  kind: SignalKind;
  /** Headline dwell in ms (headline rows only). */
  dwellMs?: number | undefined;
  at: Date;
}

export const HEADLINE_STOP_MS = 3000;
export const READING_NOW_MS = 5 * 60 * 1000;

export const personOf = (visitorId: string): string => visitorId.replace(/^[a-z]+_/, '');
const isTest = (visitorId: string): boolean => /^(zz)?test/i.test(visitorId) || /^(zz)?test/i.test(personOf(visitorId));

export function isReadSignal(s: Signal, excluded: ReadonlySet<string>): boolean {
  if (!s.visitorId || isTest(s.visitorId) || excluded.has(personOf(s.visitorId))) return false;
  if (s.kind === 'swipe' || s.kind === 'page_dwell') return true;
  return s.kind === 'headline' && (s.dwellMs ?? 0) >= HEADLINE_STOP_MS;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export function readerFigures(signals: Signal[], now: Date, excluded: ReadonlySet<string> = new Set()) {
  const ok = signals.filter((s) => isReadSignal(s, excluded));
  const today = dayOf(now);
  const todays = ok.filter((s) => dayOf(s.at) === today);
  const reads = new Set(todays.filter((s) => s.storyId).map((s) => `${personOf(s.visitorId)}|${s.storyId}|${today}`));
  return {
    readingNow: new Set(ok.filter((s) => now.getTime() - s.at.getTime() <= READING_NOW_MS).map((s) => personOf(s.visitorId))).size,
    readersToday: new Set(todays.map((s) => personOf(s.visitorId))).size,
    readsToday: reads.size,
  };
}
