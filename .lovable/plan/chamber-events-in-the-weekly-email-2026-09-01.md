# Chamber events in the weekly email

Yes, this is possible — and cleanly. The chamber's events page is a Webflow page that loads its calendar from a JSON endpoint (`members.eastbourneunltd.co.uk/ajax_website/ajax_retrieveevents.php`). I fetched it successfully: it returns structured event records with ID, title, start datetime, human-readable time, description HTML and an image. No scraping guesswork needed.

## What gets built

**1. Event ingestion (generic, per-topic)**
- A new `ingest-chamber-events` edge function that POSTs to the chamber endpoint for a rolling date window, parses the JSON, strips the messy HTML in `details` down to a clean short summary, and upserts into the existing `events` table (`topic_id`, `title`, `start_date`, `start_time`, `end_time`, `location`, `description`, `source_url`, `source_name`, `source_api = 'chamber_feed'`).
- Deduplication by the chamber's `eventID` so repeated runs update rather than duplicate.
- The endpoint URL is stored as topic configuration (not hardcoded), so other feeds can add their own event source later. Eastbourne gets the chamber URL.
- Scheduled daily via cron, plus a manual "Refresh events" button in the topic's Regional Features settings.

**2. Events block in the weekly email**
- `send-email-newsletter` gains an events fetch for `notificationType === 'weekly'`: published events for the topic whose `start_date` falls in the next 7 days, ordered by date, capped at ~6.
- The weekly template gets a new "What's on this week" section rendered *after* the stories: date, time, title, venue, and a link back to the chamber event page. Small, text-led, matching the existing email styling.
- **Appropriate weeks only**: if there are no upcoming events, the section is omitted entirely — the email looks exactly as it does today.
- Daily emails are untouched.

**3. Controls**
- Reuses the existing `events_enabled` toggle on the topic. Events only appear in the email when that toggle is on and an event source URL is configured.
- Owner preview: the existing test-send path renders the combined news + events email so you can check it before it goes out.

## Technical notes

- No schema change needed to `events` beyond storing the external event ID — added as a nullable `external_id` text column with a unique index on `(topic_id, source_api, external_id)` for idempotent upserts, plus an `event_source_url` field on `topics`.
- The chamber endpoint requires a `Referer` and `X-Requested-With` header to respond; the function sets both.
- Event descriptions come as Word-pasted HTML; they're sanitised to plain text and truncated for the email.
- The public feed's existing events display (events between stories) automatically benefits from the ingested data.

## Verify before shipping

The chamber feed's date-window parameters aren't documented; the first implementation step is confirming which `start`/`end` params it honours so we pull only the relevant window rather than the full history.
