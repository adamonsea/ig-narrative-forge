# Image costs: what you pay, what you paid, what changes

## Price per image (1536x1024, the size we use)

| Tier | Normal (instant) | Batch (up to 24h) |
| --- | --- | --- |
| Quick | $0.013 | $0.0065 |
| Creative | $0.05 | $0.025 |
| Premium | $0.20 | $0.10 |

All automated illustrations use Quick. Creative is the default when you generate by hand; Premium only when you pick it.

## What you actually spent

August (last full month): **$24.52**
- 1,383 Quick images you triggered by hand: $18.15
- 478 Quick images from automation: $6.23
- 3 Creative: $0.15

Last 30 days: **$16.64**. September so far: **$4.11**.

## What the new regime saves — honest answer: very little

Checking the last 60 days of generations against the stories themselves:
- Every automated illustration was made within 24 hours of the story arriving. The new batch route only applies to stories older than 24 hours, so on current behaviour it almost never fires.
- The cap of 3 regenerations would have blocked 13 generations out of 2,154.

Projected monthly spend under the new regime: **roughly $23-24** — essentially unchanged.

The real cost is elsewhere: 915 of 2,154 generations (42%) were repeat images on a story that already had one, nearly all triggered by hand. That is about $6 a month on its own, and it is the only large lever.

## Proposed changes to actually cut the bill

1. Send automated illustrations through the batch route by default, not just for old stories — but only for stories that are not yet published. A story waiting in the queue can take the overnight route; anything already live keeps generating instantly. Expected saving: about half of the automated spend.
2. Add a short hold before automation illustrates: if a story is not published within 2 hours, its image goes batch. Published-first stories stay instant.
3. Tighten the regeneration cap from 3 to 2, and show the count on the story card so it is visible before you burn another one.
4. Show a running monthly image spend figure on the feed dashboard, with the per-feed breakdown already added, so a spike is obvious the week it happens rather than the month after.

Expected result: roughly $10-13 a month instead of $24, with no change to how quickly published stories get their picture.

## Technical notes

- `auto-illustrate-stories` decides fresh vs batch on `created_at`; change the test to `status <> 'published'` plus an age check, keeping the existing instant fallback.
- `story-illustrator` already accepts `useBatch` and records jobs in `illustration_batch_jobs`; `illustration-batch-poller` runs hourly and falls back to instant generation on any batch failure, so no story can be left without an image.
- Regeneration cap constant lives in `story-illustrator`; the count is on `stories.illustration_regen_count` and can be surfaced in the pipeline card.
- No schema changes needed.
