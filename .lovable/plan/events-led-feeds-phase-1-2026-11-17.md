# Events-led feeds — Phase 1

A feed setting plus better event cards, inside the events pipeline you already have. Eastbourne stays News-led and Grouped, and nothing about it changes.

## 1. Feed settings (Feed Settings → Events section)
- **Lead with: News | Events** (default News). This is a new column on topics, so existing feeds keep their current behaviour.
- **Event cards: Grouped | Individual**. When unset, it follows the "Lead with" choice: Events → Individual, News → Grouped.
- Feed setup already lets you continue with only a what's-on source (fixed earlier). An events-led feed hides the "add a news source" nudge.

## 2. Placement — still `feedCardPositions.ts`, not a parallel system
- Add one function, `feedRun(mode)`, to the same registry:
  - **News-led**: unchanged. Stories are the run, and What's On sets sit at `whatsOnPositions()`.
  - **Events-led**: the base list becomes events (soonest first, filtered by `hasStarted` and `onePerTitle`). News stories become the slotted card type, with a new `newsInEvents` sequence rule (for example after events 3, then every 5). Other extras keep their existing rules, counted against the new base list.
- The existing collision test covers the new rule. A test also checks that Eastbourne-style settings produce exactly today's positions.
- Paging works the same way (20 at a time, sorted by date then id, with a 2-item overlap) on a new `get_topic_events_feed` call.

## 3. Individual event card (two slides)
- Built on the existing feed card, so swiping and the dots behave the same.
- **Slide 1**: a large date block in sentence case (e.g. "Thu 19 Nov"), the category icon (animated only while the card is in view), the title and the venue.
- **Slide 2**: time, venue, price or "Free" only when we know it, at most two lines of description, and one "Go to listing" button that uses `record_event_click`.
- Colours come from `feedBrandPalette()`, and the icon accent is the feed colour.

## 4. Categories
- Reuse `events.event_type`. A migration maps old values: music → music, comedy → comedy, shows/musicals → arts-theatre, art_exhibitions → arts-theatre, events → other.
- **At gather**, in this order:
  1. The listing site's own category, if it gives one.
  2. Keyword rules on title, description and venue (`category.ts`, with tests).
  3. A model fallback, run as a separate job after saving. It never blocks gathering and never overwrites an owner's choice.
- **Per feed**: a new `topic_event_categories` table holds the starting set of ten plus anything added. "Other" is always available.
- **Desk event drawer**: one row of category chips. One tap saves, the choice sticks and future gathers don't change it.

## 5. Category suggestions
- Runs daily. When 8 or more "Other" events in the last 30 days share a theme, one amber line appears pinned in the Event pool: "12 events look like Comedy. Add it?" with Add and Skip.
- Add re-tags those events. Skip is remembered for that theme.
- Themes use rules first, with the model only to name the theme.

## 6. Icons
- Save your component exactly as `src/components/events/EventCategoryIcon.tsx`. Move `EVENT_CATEGORY_ICON_CSS` into `index.css` once and remove the inline `<style>`. Nothing is redrawn or restyled.
- Add an optional `illustration` slot that defaults to empty, for the per-category art you'll supply later.
- Add the full icon set to /design, still and animated, with the default accent and a feed-colour accent.

## 7. Desk
- Event pool cards show the static icon in place of the date chip's spare corner. No other new labels.

## What the gatherer doesn't capture yet (checked against live data)
- **Lisbon has one source**, and it is a single event page (`agendalx.pt/events/event/recital-ao-ocaso-3/`), not a listings page. That one URL produced 198 upcoming events.
- **Of those 198**: 0 have a start time, 0 a description and 0 a price. 192 have a venue.
- **Eastbourne**: 47 of 235 events have descriptions, and 0 have prices.
- **There's no price field** in the JSON-LD reader. I'll add `offers.price`, `isAccessibleForFree` and the currency, plus `price_text` and `is_free` columns. Price stays hidden unless the source states it.
- **Description quality**: I'll read JSON-LD `description` and the page's meta description, strip HTML, and keep a short version (up to about 240 characters, no "Buy tickets" boilerplate).
- **Category signals**: I'll read the JSON-LD `@type` (MusicEvent, ComedyEvent, SportsEvent and so on) and keywords, agendalx's own category from its URL and taxonomy, and the WordPress Events Calendar `categories`.
- **agendalx specifically**: the source should be its English listings page or its WordPress events list. I'll test that reader first, including whether English titles are available, before building the cards.
- **Time zone**: the date rules use London time. Lisbon is on the same time zone, so it's fine for now, but a per-feed time zone setting is needed before any non-UK/Portugal feed.

## Conflicts with AGENTS.md, and Eastbourne risk
- **AGENTS.md says** "the feed reads events only via `get_topic_whats_on` (next 31 days…) and rotates up to three WhatsOnCard sets". Individual mode needs a paged, longer-range read. I'll replace that rule with: "Grouped reads `get_topic_whats_on`; Individual reads `get_topic_events_feed`, same filters."
- **AGENTS.md also says** public-feed extras, events included, show only when switched on. An events-led feed needs events on. Choosing "Lead with Events" will turn the feed's events switch on (a single, visible change) rather than bypassing it.
- **AGENTS.md calls** the global categories regional only. Event categories are a separate per-feed set, so there's no clash, and I'll add one line to AGENTS.md saying so.
- **Where the brief would add something not yet on /design**: the price line and the date block. Both get added to /design first.
- **Eastbourne**: every new behaviour is behind the two settings, which default to News and Grouped. The category migration only rewrites `event_type`, which the grouped card doesn't show. I'll check the Eastbourne feed and run the tests after each step.

## Build order
1. Gatherer fields and category rules, tested on agendalx and Eastbourne.
2. Migration (settings columns, category table, value mapping).
3. Icon component, CSS and /design.
4. Individual card and placement.
5. Desk icon and category chips.
6. Suggestions.
