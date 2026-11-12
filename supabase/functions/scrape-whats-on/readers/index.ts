/**
 * Registry of events readers. To support a new kind of source:
 *   1. write readers/<kind>.ts implementing EventReader,
 *   2. add it to READERS and DETECT_ORDER below,
 *   3. allow the kind in the event_sources_kind_check constraint.
 */
import type { EventReader, EventSourceKind } from './types.ts';
import { calendarFeedReader } from './calendarFeed.ts';
import { whatsOnPageReader } from './whatsOnPage.ts';

export type { EventReader, EventSourceKind, ReaderEvent, ReaderResult } from './types.ts';

export const READERS: Record<EventSourceKind, EventReader> = {
  calendar_feed: calendarFeedReader,
  whats_on_page: whatsOnPageReader,
};

/** Most specific first; the what's-on page reader is the catch-all. */
const DETECT_ORDER: EventSourceKind[] = ['calendar_feed', 'whats_on_page'];

export const isEventSourceKind = (k: unknown): k is EventSourceKind =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(READERS, k);

export function readerFor(kind: unknown): EventReader {
  return isEventSourceKind(kind) ? READERS[kind] : whatsOnPageReader;
}

/** Work out what kind of source a pasted address is, so owners never have to choose. */
export async function detectKind(url: string): Promise<EventSourceKind> {
  for (const kind of DETECT_ORDER) {
    if (await READERS[kind].detect(url)) return kind;
  }
  return 'whats_on_page';
}
