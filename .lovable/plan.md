# Readers can add their own events: scope

## What readers see
- Each What's on card gets a small **"+ Add an event"** button. It sits on the cover and on the last slide, and only appears when the feed owner has turned it on.
- Tapping it opens a short form with just four fields, matching what we keep for every event:
  1. **Event name**
  2. **Date**, plus an optional start time
  3. **Venue / place**
  4. **Link to the full listing**. This is required, and it must be a real web address.
- Underneath sits one line: "The feed's editor checks every event before it appears."
- When they send it: "Thanks – the editor will take a look."
- No sign-in. There's an invisible spam trap, a limit of 3 per browser per day, and dates must fall between today and 3 months ahead.

## What the feed owner sees
- On the Desk, next to the Events switch, there's a new tick box: **"Let readers suggest events"**. It's off by default for every feed.
- Suggestions land in **Waiting** with a "Reader" chip and the usual one tap: Publish / Skip. Reader suggestions never go live without the owner, even if Auto-publish is on.
- When a suggestion comes in, the location check runs too. Out-of-area suggestions go straight to Hidden, as with scraped events.
- Turning the box off hides the button straight away. Suggestions already sent stay on the Desk.

## Deliberately left out
- No email to the person who suggested it, and no account or contact details collected (so less personal data to look after).
- No photos, descriptions, prices or categories.
- No editing of suggestions. The owner publishes or skips.

## Technical details
- Settings: new `reader_event_submissions` boolean on `topic_insight_settings`, default false.
- Storage: reuses `events` with `source_api = 'reader'`, `status = 'pending'`, and `event_source_id` null. Nothing new in Sources.
- Write path: a public edge function `submit-reader-event` (Zod validation, honeypot, per-visitor and per-IP rate limit via `rate_limits`, checks the feed's switch, runs `judgeEvents` locality, forces pending/excluded, never published). There are no direct reader writes to `events`.
- Reader button gated by the switch and `canTrackReader()`-independent (submission is an explicit action). The modal uses the existing Dialog and is keyboard and screen-reader friendly.
- Tests: pure rules (date window, URL required, never auto-publish, switch off → rejected).
