## What's actually happening in Eastbourne

The automation IS running every 10 minutes — but it queues **0 stories every single run**. Eastbourne currently has **219 articles stuck in the manual ("non-automated") queue**. Here's the breakdown of why:

### Root cause 1 — The queue is clogged by "zombie" articles (the big one)
Every run, `auto-simplify-queue` fetches the **top 20 highest-quality** new articles (ordered by quality score, hard limit of 20) and tries to queue them. But those top 20 slots are permanently occupied by **36 articles that already have a `completed` generation record**:
- The "already queued" check skips an article if it has **any** queue row, regardless of status — including long-finished `completed` ones.
- So the same ~20 finished articles get fetched, skipped, and re-fetched forever. The queue head never advances, and genuinely new articles never get reached.
- Of those 36 zombies: **13 already have a published story** (should be marked done) and **23 have no story at all** (their story was deleted — they should be re-generated).

Net effect: **89 perfectly eligible Eastbourne articles (score ≥ 75) are sitting in `new` status behind the clog**, never auto-queued.

### Root cause 2 — High quality bar, and no keyword "fast pass"
- The live threshold is **75** (from `topic_automation_settings.quality_threshold`), not the 30 shown on the topic record — these two settings are inconsistent. **94 new articles score below 75** and are silently held back forever.
- There is **no positive-keyword matching anywhere**. An article literally titled "Eastbourne Carnival" does **not** get a fast pass for matching the topic's keywords — auto-flow is decided purely by the quality score. So a clearly on-topic local story scoring 70 stays manual.

### Why "keyword like Eastbourne" doesn't push a story through
Nothing in the pipeline routes articles by topic keyword. Keywords are used upstream (scraping/relevance) and for **negative** filtering only. The auto-queue gate is: `quality_score ≥ threshold` AND not already queued AND no existing story. That's it.

---

## Proposed fix

### 1. Fix the "already queued" check (unblocks the clog)
In `auto-simplify-queue/index.ts`, only treat an article as "already queued" when it has an **active** (`pending`/`processing`) queue row — mirroring the orphan-recovery logic that already exists in the same file. Then:
- If a `completed` row exists **and** a story exists → mark the article `processed` (it's genuinely done, remove it from rotation).
- If a `completed`/`failed` row exists but **no story** → clear/ignore the stale row and re-queue it for regeneration.

This immediately frees the 23 storyless zombies for regeneration and retires the 13 finished ones, clearing the top-20 logjam.

### 2. Stop the limit from starving the topic
The hard `limit(20)` combined with `order by quality desc` is what let the zombies monopolise every run. After fix #1 this is far less harmful, but to be safe, exclude articles with active queue rows / existing stories **in the query itself** (or order by `created_at` so fresh items aren't perpetually outranked), so each run makes real progress.

### 3. One-time cleanup of the existing backlog
Run a one-off correction for Eastbourne (and any other affected topic):
- Mark the 13 `new`+completed+has-story articles as `processed`.
- Re-evaluate the 23 `new`+completed+no-story articles for regeneration.
This drains the stuck backlog so the recurring fix has a clean starting point.

### 4. Decide the quality-threshold & keyword policy (needs your input)
Two product choices that change how much flows automatically:
- **Threshold:** keep 75, or lower it (e.g. 50/60) so more local stories auto-flow? Also reconcile the conflicting 30 vs 75 settings so the UI reflects reality.
- **Keyword fast-pass:** optionally add a rule so articles strongly matching topic keywords (e.g. "Eastbourne") auto-qualify even if their quality score is slightly under threshold.

I'll confirm your preference on #4 before implementing those parts.

---

## Safety / non-regression notes
- All changes are confined to the automation edge function + a one-time data correction; **no changes to feed rendering, play pages, or reader-facing UX.**
- Negative-keyword filtering, parliamentary exclusions, and the existing orphan-recovery behaviour are preserved.
- The fix makes the "already queued" guard *stricter about what blocks*, so it cannot accidentally double-generate live stories (active rows still block; finished rows are resolved explicitly).

## Technical reference
- `supabase/functions/auto-simplify-queue/index.ts` — lines 143–150 (fetch + limit), 201–211 (the over-broad already-queued check to fix), 213–228 (existing-story handling to extend), 71–113 (orphan-recovery pattern to mirror).
- Live settings: `topic_automation_settings` for Eastbourne = `automation_mode: holiday`, `quality_threshold: 75`, `auto_simplify_enabled: true`. Cron `auto-simplify-queue-cron` runs every 10 min (healthy).
- `universal-topic-automation` only **scrapes**; it does not queue — so all auto-generation depends on `auto-simplify-queue` working.