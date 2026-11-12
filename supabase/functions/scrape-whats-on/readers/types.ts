/**
 * The contract every events reader follows. Adding a new kind of events source
 * (iCal subscription, Eventbrite, …) means writing one reader that implements
 * EventReader and registering it in readers/index.ts — storage, status, refresh,
 * edit and removal are shared and need no changes.
 */
export type EventSourceKind = 'whats_on_page' | 'calendar_feed';

export interface ReaderEvent {
  /** Stable identity of this event within its source (used for upserts and sticky removals). */
  key: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time?: string | null;
  venue: string | null;
  url: string | null;
  description?: string | null;
  category?: string | null;
  /** Per-event credit; falls back to the source's name. */
  source_name?: string | null;
}

export interface ReaderResult {
  events: ReaderEvent[];
  method: string | null;
  /** Suggested name for the source, shown to readers. */
  name: string;
  error?: string | null;
}

export interface EventReader {
  kind: EventSourceKind;
  /** events.source_api value for rows from this reader. */
  sourceApi: string;
  /** events.external_id for a stored event. */
  externalId(sourceId: string, key: string): string;
  /** Does this address look like this kind of source? (cheap; may do one small fetch) */
  detect(url: string): Promise<boolean>;
  read(url: string): Promise<ReaderResult>;
  /** Re-publish stored rows on every check (legacy calendar behaviour). Default: curator removals stick. */
  republish?: boolean;
}
