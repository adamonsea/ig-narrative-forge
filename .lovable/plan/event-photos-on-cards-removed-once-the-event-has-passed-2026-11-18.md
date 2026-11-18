# Event photos on cards, removed once the event has passed

## What readers will see
- Individual event cards show the listing's own photo in the top band when the source provides a good one.
- The date block and category pill sit on a soft fade at the bottom of the photo so they stay easy to read.
- No photo, a poor photo, or one that fails to load: the card shows the category illustration, exactly as today.
- Grouped cards, Eastbourne and the emails stay as they are.

## What owners get
- Desk event drawer: shows the photo, with one action "Use illustration" (sticky for that event, survives re-gathers).
- Feed Settings, events fold: one switch "Event photos", on by default.

## Where photos come from (from the audit)
- Agenda LX (Lisbon): `featured_media_large`, 100% coverage.
- Brighton Centre: `ListViewImage`, 100% coverage.
- Any page with JSON-LD `image`, and WordPress Events Calendar `image.url`.
- Eastbourne Chamber: none (cards keep the illustration).

## How a photo is accepted
- HTTPS, image type (JPEG, PNG or WebP), under 5MB, at least 600px wide, landscape or square.
- Generic pictures are skipped: if the same image address appears on more than a quarter of a source's events, it is a logo or placeholder.
- Robots rules are respected, as for the listing pages.

## Storage, and deleting photos after the event
- Each accepted photo is shrunk to 800px wide and saved once in Curatr's own storage, so cards load fast and never depend on the venue's site.
- Photos are deleted:
  - the day after the event ends (end date, or start date when there is no end date);
  - when the event is dropped by its source, removed by the owner, or its source is deleted;
  - when the owner picks "Use illustration".
- A sweep in the same twice-daily gather also deletes any stored photo that no longer matches an upcoming event, so nothing builds up.
- No new scheduled job: cleanup runs inside the existing 06:15 and 17:15 gather.

## Order of work
1. Database: add photo fields to events; create the photo storage area.
2. Gatherer: readers pick up image addresses; validate, shrink and save; cleanup and sweep.
3. Event card: photo band with fade, illustration fallback.
4. Desk drawer action and the Settings switch; add the photo card state to `/design`.
5. Gather Lisbon once and report photo coverage; check Eastbourne is unchanged; run tests.

## Technical details
- Migration: `events.image_path text`, `events.image_source_url text`, `events.image_hidden boolean default false`; `topics.event_photos_enabled boolean default true`. Update `get_topic_events_feed` / `get_topic_whats_on` to return a public `image_url` built from `image_path` only when the feed switch is on and `image_hidden` is false.
- Storage: new public bucket `event-images`, path `{topic_id}/{event_id}.jpg`; writes only by service role (no client write policies).
- `ReaderEvent` gains `image?: string | null`; set in `pageData.ts` (Agenda LX, Umbraco, WP Events Calendar) and the JSON-LD path in `extract.ts`. Placeholder rule and size checks live in a new pure, tested `scrape-whats-on/eventImage.ts`.
- Shrinking with imagescript (decode, resize to 800w, JPEG ~80%), done in the background after the upsert, max ~40 new photos per run so a gather never times out; the rest are picked up next run.
- Image is re-fetched only when `image_source_url` changes.
- Cleanup collects `image_path` before every events delete path in `index.ts` (delisted, `deleteUpcoming`, source removal) and on `set_topic_event_visibility` remove; then `storage.remove()` in batches of 100. Sweep lists `event-images/{topic_id}` per gathered topic and removes paths not in upcoming, visible events.
- `EventCard.tsx`: `<img loading="lazy" decoding="async">` at 800w with `object-cover`, a bottom gradient using feed tokens, `onError` falls back to `EventCategoryIllustration`. Placement, slide 2 and grouped cards untouched.
- New AGENTS.md rule: event photos are stored copies, never hotlinked, deleted after the event; one gatherer path owns saving and cleanup.
