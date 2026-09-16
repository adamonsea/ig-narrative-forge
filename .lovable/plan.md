# Why strong local stories aren't passing automatically

## What's happening

Holiday mode itself is running fine on Eastbourne — gathering every 4 hours, writing stories, illustrating and publishing, with no errors.

The problem is the automatic story-writing step only looks at the 20 highest-scoring unprocessed articles each run. Eastbourne currently has 225 unprocessed articles scoring 75% or above, and every one of the top 20 is an old item (July and August) that was held because it names Hailsham, Pevensey, Uckfield or similar rather than Eastbourne.

Those held items are never set aside, so they sit at the top of the list forever. Each run re-checks the same 20, holds the same 20, and never gets far enough down the list to see today's genuine Eastbourne stories. That's why a high-scoring article with the town in its headline can still sit there untouched.

## The fix

1. **Stop held items blocking the queue.** When an article is held by the place check or the category check, record that on the article (a "held" note with the date and reason) instead of leaving it looking brand new. Held items no longer get re-examined on every run.

2. **Recheck held items occasionally, not constantly.** A held item is re-examined once a day rather than every ten minutes, so a change to your places or categories still lets it through, without it clogging the list.

3. **Look at newest first, not highest-scored first.** Within the articles that clear the threshold, today's arrivals get looked at before a two-month-old backlog item.

4. **Look at more per run.** Raise the per-feed batch from 20 to 50 so a burst of arrivals is cleared in one pass.

5. **Clear the existing jam.** Mark the current backlog of held articles as held so the queue starts fresh from today's stories. Nothing is deleted — they stay visible in Arrivals for manual approval exactly as now.

## Technical detail

- Add `held_at timestamptz` and `held_reason text` to `topic_articles` (nullable, no default) via migration; no grant changes needed as the table is already exposed.
- In `auto-simplify-queue`:
  - main article fetch adds `.or('held_at.is.null,held_at.lt.<now-24h>')` and changes ordering to `created_at desc` then `content_quality_score desc`; `maxPerTopic` 20 → 50.
  - locality-gate and category-gate hold branches write `{ held_at: now, held_reason }` before `continue`, and a successful pass clears them back to null.
  - orphan-recovery reset to `'new'` also clears `held_at` so a genuinely re-opened article is looked at immediately.
- One-off backfill in the same migration: set `held_at = now()`, `held_reason = 'backlog'` for `processing_status = 'new'` rows older than 48 hours in regional topics, so the window starts clear.
- No change to publishing, illustration or scraping paths.

## Verification

After deploying, confirm the next run's logs queue today's Eastbourne arrivals, and check that the count of articles queued in the following hour is non-zero while the 225-item backlog stays in Arrivals.
