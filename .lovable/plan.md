# Fix 4: raise the "stopped" bar

## What the data shows (all feeds, outside readers only)

We store the raw dwell time (`max_dwell_ms`: the longest unbroken stretch the card was at least 60% on screen, capped at 30s), not just the paused flag. Every row with a dwell time dates from 6 Nov onwards, and there are only 77 rows in total.

| Dwell | Rows | Marked paused now |
|---|---|---|
| under 1s | 19 (16 of them are 0s) | 0 |
| 1–2s | 11 | 6 |
| 2–3s | 7 | 7 |
| 3–5s | 17 | 17 |
| 5–10s | 10 | 10 |
| 10s+ | 13 (8 hit the 30s cap) | 13 |

Median dwell is 4.4s, a quarter of rows are under 2.4s and the top 10% hit the cap. Today 53 of 77 rows (69%) count as paused.

## Proposed threshold: 3 seconds

On a phone, a card fills most of the screen, so just scrolling past it keeps it 60% visible for 1–3s. There is a dip at 2–3s (7 rows) between the scrolling-past group (under 3s, 37 rows) and the stopped group (3s and over, 40 rows). At 3s, **52% of impressions** count as stopped. At 5s it would be 30%. 77 rows is too few to prove where the real break is, so I'd go with 3s now and check again once there are 500+ rows. It's a single setting to change.

## Everything that touches "paused"

- **Writes it:** `src/lib/headlineStopTracker.ts` (`STOP_MS = 1500` sets the flag, and the raw dwell is sent with it) and the database function `record_story_views` (keeps paused once it's set, keeps the longest dwell).
- **Reads it:** only the database function `story_stop_scores`. Through that function it feeds the Readership top headline stopper, the dashboard card's headline highlight (`get_dashboard_feed_cards`) and the widget's Most read shelf (`get_widget_social_proof`).
- **Doesn't use it:** the drop-off curve only uses card position. No page code, background service, email, Desk pulse, reads count or visitor count reads it. I searched the code and every database function to confirm.

## Old vs new rows: one rule for both

`story_stop_scores` will stop reading the flag. It will count a stop as `max_dwell_ms >= 3000` instead. Old and new rows then use the same rule, worked out from the raw dwell, so nothing has to be rewritten and the two can't mix. The tracker's `STOP_MS` also goes to 3000, so the stored flag matches. Old flags stay as they were, but nothing reads them any more. Rows from before 6 Nov have no dwell and no position, so the score already leaves them out.

## Changes

1. `headlineStopTracker.ts`: `STOP_MS` 1500 → 3000. Nothing else changes.
2. One database change: replace `story_stop_scores` so it uses `(max_dwell_ms >= 3000)` in place of `paused`. Same inputs and outputs, same 30-reader floor, still blocked from app users.
3. Update the AGENTS.md rule and the project memory to say a stop means 3s or more.

## What could break and how I'll check

- **Score function:** if I get its replacement wrong, the Readership page, card and shelf lose their headline figures. I'll call it for Eastbourne in a test that's thrown away afterwards, before and after, and confirm the stop rate drops to roughly the 3s share.
- **Tracker:** changing a number can't change when data is sent. I'll check the feed loads cleanly and still sends headline views.
- **What you'll see:** nothing yet. No story has 30 positioned readers, so nothing is displayed today.
- **Tests:** run the Readership and feed-card tests.

Nothing gets published.
