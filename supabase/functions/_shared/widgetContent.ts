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
