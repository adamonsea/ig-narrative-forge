## Diagnosis: Why "care home" still slips through

I traced the Eastbourne pipeline end-to-end. Findings:

**1. Keywords ARE saved correctly**
`topics.negative_keywords` for Eastbourne = `[carehome, care home, table tennis, bowels]` ✓

**2. Only ONE function actually filters them**
- `auto-simplify-queue` ✓ (the fix from last week)
- `topic-aware-scraper` ✓ (but this scraper isn't being used for Eastbourne)
- `daily-content-monitor` ✓ (URL-level only)

**3. The scrapers actually feeding Eastbourne don't filter**
Looking at recent care-home stories' `import_metadata`, every one used `scrape_method: multi_tenant`. I grepped both `multi-tenant-scraper` and `universal-topic-scraper` — neither checks `negative_keywords`. So articles enter `topic_articles` regardless of the topic's negative keyword list.

**4. The auto-simplify-queue safety net has gaps**
- It only processes `processing_status = 'new'` articles. Once an article becomes a story, it's `processed` and never re-evaluated.
- `discarded_articles` shows **zero** rows ever discarded by `auto-simplify-queue` for negative keywords — so either the keywords were added after the most recent care-home story (April 25) or the runtime check never matched. The code looks correct, so this most likely indicates timing.
- For Eastbourne (holiday mode), auto-simplify runs ~hourly. A scrape can happen, queue-processor can fire, and a story can be generated within ~9 minutes — narrow but real window.

**5. Existing care-home stories are not retroactively removed**
There are 7+ live "care home" stories on Eastbourne, all created before today. Adding the keyword now does nothing about them.

---

## The fix

### Part A — Block at scrape time (universal-topic-scraper + multi-tenant-scraper)
Mirror the pattern already in `topic-aware-scraper`:
1. Fetch `topics.negative_keywords` once at the start of a topic's scrape run.
2. After extracting each article's title + body, lowercase the combined text and check if any keyword is a substring.
3. On match: skip insertion into `topic_articles` and write a row to `discarded_articles` with `discarded_reason: "Negative keyword: <kw>"` and `discarded_by: "<scraper-name>"`. This also prevents re-scraping next cycle.

### Part B — Retroactive cleanup of existing stories
Add a new admin-triggered edge function `purge-negative-keyword-stories`:
1. For a given topic (or all topics), load `negative_keywords`.
2. Find all `stories` whose linked `shared_article_content.title` or `body` contains a keyword.
3. Soft-delete: set `stories.status = 'archived'` (or hard delete if the user prefers — see question below) and mark the topic_article as `discarded`.
4. Add the URL to `discarded_articles` so it can't come back.
5. Return a summary `{ topic, matched_keyword, story_id, title }[]`.

Wire a button into the existing **TopicNegativeKeywords** card: "Purge existing stories matching these keywords" with a confirmation dialog showing the count first (dry-run preview).

### Part C — Strengthen the runtime safety net
In `auto-simplify-queue`, also re-check articles that are already `processed` but don't yet have a published story (rare orphan path). Low priority — Part A makes this mostly moot.

### Part D — Visibility
Add a small "Filtered by negative keyword" counter to the Discarded Articles viewer so the curator can see the filter is actively working.

---

## Files to change

- `supabase/functions/multi-tenant-scraper/index.ts` — add negative keyword filter
- `supabase/functions/universal-topic-scraper/index.ts` — add negative keyword filter
- `supabase/functions/purge-negative-keyword-stories/index.ts` — **new** function (dry-run + execute modes)
- `src/components/TopicNegativeKeywords.tsx` — add "Preview & purge existing matches" button
- `src/components/DiscardedArticlesViewer.tsx` — add negative-keyword filter chip/count

No DB schema changes required.

---

## One thing to confirm before I build

When I retroactively purge existing matching stories (e.g., the 7 "care home" Eastbourne stories), should they be:
- **Archived** (soft delete — hidden from feed but recoverable), or
- **Hard deleted** (gone from DB completely)?

I'll default to **archived** unless you say otherwise — safer and reversible.