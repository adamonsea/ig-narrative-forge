/**
 * What a website widget shows: news, upcoming events, or both behind News | What's on tabs.
 * One rule set for the widget data function, the embed script's builder and tests.
 * Embeds set it with data-content; without it ("auto") events-led feeds show events and
 * every other feed keeps showing news, so existing embeds never change on their own.
 * A widget is never left empty while the other stream has something to show.
 */
export type WidgetContent = 'auto' | 'stories' | 'events' | 'both';
export type ResolvedWidgetContent = 'stories' | 'events' | 'both';

export const WIDGET_CONTENTS: readonly WidgetContent[] = ['auto', 'stories', 'events', 'both'];

export function parseWidgetContent(raw: unknown): WidgetContent {
  return typeof raw === 'string' && (WIDGET_CONTENTS as readonly string[]).includes(raw)
    ? (raw as WidgetContent)
    : 'auto';
}

export interface WidgetContentFacts {
  /** The feed leads with events (feed setting). */
  eventsLed: boolean;
  /** Events are switched on and shown in the feed itself. */
  eventsShown: boolean;
  storyCount: number;
  eventCount: number;
}

export function resolveWidgetContent(requested: WidgetContent, f: WidgetContentFacts): ResolvedWidgetContent {
  const hasEvents = f.eventsShown && f.eventCount > 0;
  const hasStories = f.storyCount > 0;
  const emptyFallback: ResolvedWidgetContent = f.eventsLed && f.eventsShown ? 'events' : 'stories';

  switch (requested) {
    case 'both':
      if (hasEvents && hasStories) return 'both';
      return hasEvents ? 'events' : hasStories ? 'stories' : emptyFallback;
    case 'events':
      return hasEvents ? 'events' : hasStories ? 'stories' : emptyFallback;
    case 'stories':
      return hasStories ? 'stories' : hasEvents ? 'events' : 'stories';
    default:
      if (f.eventsLed && hasEvents) return 'events';
      return hasStories ? 'stories' : hasEvents ? 'events' : emptyFallback;
  }
}

/** Which tab opens first when a widget shows both. */
export function firstWidgetTab(eventsLed: boolean): 'stories' | 'events' {
  return eventsLed ? 'events' : 'stories';
}

/** Footer link wording for the events list. The count is capped at what was looked up. */
export function eventsCtaText(count: number, cap: number): string {
  if (count <= 0) return "See what's on →";
  if (count >= cap) return `${cap}+ events coming up →`;
  return count === 1 ? '1 event coming up →' : `${count} events coming up →`;
}

/**
 * How a widget looks: "list" = headlines (the original embed), "cards" = a swipeable row
 * of feed-style cards. Embeds set it with data-style; anything else means list, so
 * existing embeds never change on their own.
 */
export type WidgetStyle = 'list' | 'cards';

export function parseWidgetStyle(raw: unknown): WidgetStyle {
  return raw === 'cards' ? 'cards' : 'list';
}

export interface WidgetMixItem {
  kind: 'story' | 'event';
  /** Position in that stream's own list (stories or events). */
  index: number;
}

/**
 * Order for a "both" cards widget: one row, led by what the feed leads with —
 * two of the lead stream, then one of the other, repeating. When one stream runs
 * out the other fills the rest, so the row is never shorter than it could be.
 */
export function mixWidgetCards(storyCount: number, eventCount: number, eventsLed: boolean, total: number): WidgetMixItem[] {
  const lead: WidgetMixItem['kind'] = eventsLed ? 'event' : 'story';
  const other: WidgetMixItem['kind'] = eventsLed ? 'story' : 'event';
  const left = { story: Math.max(0, storyCount), event: Math.max(0, eventCount) };
  const next = { story: 0, event: 0 };
  const out: WidgetMixItem[] = [];
  const limit = Math.min(Math.max(0, total), left.story + left.event);
  while (out.length < limit) {
    const want = out.length % 3 === 2 ? other : lead;
    const kind = next[want] < left[want] ? want : want === lead ? other : lead;
    out.push({ kind, index: next[kind] });
    next[kind] += 1;
  }
  return out;
}
