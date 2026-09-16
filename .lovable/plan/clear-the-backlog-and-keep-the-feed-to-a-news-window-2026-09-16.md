# Clear the backlog and keep the feed to a news window

## What's wrong now

Holiday mode itself runs fine on Eastbourne — gathering every 4 hours, writing, illustrating and publishing, no errors.

The jam is that the automatic writing step only looks at the 20 highest-scoring unreviewed articles each run. Eastbourne has 225 unreviewed articles scoring 75% or more, and all 20 at the top are old July/August items held because they name Hailsham, Pevensey or Uckfield rather than Eastbourne. They are re-checked and re-held every run, so today's genuine Eastbourne arrivals are never reached. That is why a strong local headline can sit there untouched.

## What we'll do

1. **Clear the old backlog.** Every unreviewed article older than 4 days that was never turned into a story gets discarded. For Eastbourne that clears roughly 490 items, including the 225 blocking the top of the queue. Nothing published is touched.

2. **Stop the jam recurring.** Articles held by the place or category check get marked as held so they stop occupying the queue window, and the queue looks at newest first rather than highest-scored first. The batch per feed goes from 20 to 50.

3. **Auto-publish what clearly qualifies.** Articles at or above the feed's threshold that pass the place check are written, illustrated and published automatically — as now, but they will actually be reached.

4. **Send the doubtful ones to review.** Anything below threshold, or held by the place or category check, stays in Arrivals for manual approval exactly as today.

5. **Age out the review pile.** A nightly job discards anything still unreviewed after 4 days. Past that point a news story has missed its window anyway, so no legacy backlog can build up again.

Discarded items go into the existing discarded list, so they are recorded and won't be re-scraped — they are not silently deleted.

## Technical detail

- Migration: add `held_at timestamptz` and `held_reason text` to `topic_articles`.
- `auto-simplify-queue`:
  - main fetch adds `.or('held_at.is.null,held_at.lt.<now-24h>')`, orders `created_at desc` then score desc, `maxPerTopic` 20 → 50;
  - locality and category hold branches set `held_at`/`held_reason`; a pass clears them;
  - orphan recovery clears `held_at` when resetting to `'new'`.
- New edge function `expire-stale-arrivals`: for every topic, set `processing_status = 'discarded'` on `topic_articles` still `'new'` (or held) with `created_at < now() - 4 days` and no linked story, and upsert a `discarded_articles` row with reason `stale_arrival`. Bounded per run (500 rows), idempotent, service-role only.
- Scheduled once daily at 04:00 UTC via pg_cron, chosen because expiry is time-based and a day's precision is enough.
- One-off run of the same logic to clear today's existing backlog.
- Publishing, illustration and scraping paths unchanged.

## Verification

After the clear-out, confirm Eastbourne's unreviewed count drops to the last 4 days only, then check the next auto-simplify run queues today's Eastbourne arrivals and that new stories appear published within the hour.

## Decisions assumed

- Age limit: 4 days (from your "three or four days").
- Applies to every feed, not just Eastbourne.
