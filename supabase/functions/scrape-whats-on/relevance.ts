/**
 * Local relevance for events, scored the same way as news.
 *
 * The number comes from the shared news scorer (calculateTopicRelevance, region-first),
 * read over the event's title, venue, address and description. The location rules in
 * locality.ts then settle it: clear local evidence lifts it, a trusted local source
 * keeps it above the line, "can't tell" on a broad listings site keeps it low, and
 * clearly out-of-area (or online-only) events go to Hidden.
 *
 * placeEvent() decides where an incoming event lands. Pure, so every rule is testable.
 */
import { calculateTopicRelevance, type TopicConfig } from '../_shared/hybrid-content-scoring.ts';
import type { LocalityInput, Verdict } from './locality.ts';

/** Below this an event ranks under local ones in Waiting and never auto-publishes. */
export const LOW_RELEVANCE = 25;

/** Out of area = the location rules said no for a clear reason (not just "couldn't tell"). */
export const isOutOfArea = (v: Verdict): boolean => !v.keep && v.reason !== 'unconfirmed';

/** The news scorer's raw read for one event; null for feeds that aren't about a place. */
export function baseEventScore(ev: LocalityInput & { description?: string | null }, topic: TopicConfig | null): number | null {
  if (!topic || topic.topic_type !== 'regional' || !topic.region) return null;
  const content = [ev.venue, ev.place, ev.description].filter(Boolean).join('. ');
  try {
    return calculateTopicRelevance(content, ev.title, topic, 'regional').relevance_score;
  } catch {
    return 0;
  }
}

/** One 0–100 score per event. null = not a place-based feed (no scoring). */
export function combineRelevance(base: number | null, verdict: Verdict, localEvidence: boolean): number | null {
  if (base === null || base === undefined) return null;
  const b = Math.max(0, Math.min(100, Math.round(Number(base) || 0)));
  if (!verdict.keep) return verdict.reason === 'unconfirmed' ? Math.min(b, LOW_RELEVANCE - 5) : Math.min(b, 5);
  if (localEvidence) return Math.max(b, 60);
  return Math.max(b, LOW_RELEVANCE + 10); // a source that only lists local things
}

export type EventStatus = 'published' | 'pending' | 'excluded' | 'deleted';

export interface PlaceInput {
  /** What's already stored for this exact listing, if anything. */
  prev?: { status: string; kept_by_owner: boolean } | null;
  /** The owner skipped/removed an event with this name elsewhere in the feed. */
  removedByOwner?: boolean;
  /** The owner published an event with this name elsewhere in the feed. */
  publishedByOwner?: boolean;
  verdict: Verdict;
  score: number | null;
  autoPublish: boolean;
}

/**
 * Where an incoming event goes:
 *   owner decisions stick (skipped stays Hidden, published stays Live);
 *   something already in Waiting or Live stays put (a live one that turns out
 *   to be out of area moves to Hidden);
 *   new: out of area → Hidden; auto-publish source and not low relevance → Live; else Waiting.
 */
export function placeEvent(i: PlaceInput): { status: EventStatus; reason: string | null; kept: boolean } {
  const prevKept = Boolean(i.prev?.kept_by_owner);
  if (i.prev?.status === 'deleted' || (!prevKept && i.removedByOwner)) return { status: 'deleted', reason: null, kept: false };
  if (prevKept || i.publishedByOwner) return { status: 'published', reason: null, kept: true };
  const out = isOutOfArea(i.verdict);
  const reason = !i.verdict.keep ? i.verdict.reason : null;
  if (i.prev && i.prev.status !== 'excluded') {
    if (i.prev.status === 'published' && out) return { status: 'excluded', reason, kept: false };
    return { status: i.prev.status === 'pending' ? 'pending' : 'published', reason: null, kept: false };
  }
  if (out) return { status: 'excluded', reason, kept: false };
  if (i.autoPublish && (i.score === null || i.score >= LOW_RELEVANCE)) return { status: 'published', reason: null, kept: false };
  return { status: 'pending', reason: null, kept: false };
}
