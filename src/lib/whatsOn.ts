/** Small, testable rules for what's-on pages (events sources) in the Sources tab. */

/** A saved page is flagged once two checks in a row found no events. */
export const BROKEN_AFTER_EMPTY_CHECKS = 2;

export const isBrokenWhatsOnSource = (consecutiveEmptyChecks: number | null | undefined): boolean =>
  (consecutiveEmptyChecks ?? 0) >= BROKEN_AFTER_EMPTY_CHECKS;

const shortDate = (ymd: string): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/** "Found 8 upcoming events, e.g. 'The Nutcracker' on 4 Dec" */
export function previewSentence(found: number, example?: { title: string; start_date: string } | null): string {
  if (found <= 0) return "No upcoming events found on this page.";
  const noun = found === 1 ? "upcoming event" : "upcoming events";
  if (!example) return `Found ${found} ${noun}`;
  return `Found ${found} ${noun}, e.g. ‘${example.title}’ on ${shortDate(example.start_date)}`;
}

/** Readership line; hidden at zero. */
export function venueClicksLine(clicks: number | null | undefined): string | null {
  const n = Number(clicks) || 0;
  if (n <= 0) return null;
  return `Sent ${n.toLocaleString("en-GB")} ${n === 1 ? "click" : "clicks"} to local venues this week`;
}

/** Kinds of events source (event_sources.kind). New kinds only need a label here and a reader on the server. */
export type EventSourceKind = "whats_on_page" | "calendar_feed";

const KIND_LABELS: Record<EventSourceKind, string> = {
  whats_on_page: "What's-on page",
  calendar_feed: "Calendar feed",
};

export const eventSourceKindLabel = (kind: string | null | undefined): string =>
  KIND_LABELS[(kind as EventSourceKind)] ?? "Events source";

/**
 * One home for events: the Events switch collects events and adds them to the weekly email;
 * "Show in the feed" (only meaningful while Events is on) puts them between stories.
 */
export const showEventsInFeed = (eventsEnabled: boolean | null | undefined, showInFeed: boolean | null | undefined): boolean =>
  Boolean(eventsEnabled) && Boolean(showInFeed);
