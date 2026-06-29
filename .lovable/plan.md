## What happened (plain English)

This was **not** a security fix and **not** something you specifically requested. It came from the **Scraping Intelligence System** — the feature that "learns" the best scrape method per domain. After one successful HTML scrape, that auto-learner silently wrote a domain profile that **turned RSS off forever** for that source, based on a single data point and no actual evidence that RSS was broken.

From June 19 onward the scraper "succeeded" every run while returning **0 articles** — no error, `success_rate: 100%`, no discards. A background process quietly broke ingestion and nothing raised an alarm. That's why it felt like it came out of nowhere.

So the honest framing: it wasn't one manual change cascading — it was an **autonomous self-configuring system making a bad permanent decision and failing silently.** Preventing recurrence is therefore as important as the fix itself.

## Root cause chain (confirmed in live logs)

```text
autoLearnDomainProfile writes  preferred:'html' + skip:['rss']   (1 success → permanent)
  → next run: "Domain profile prefers html (skipping: rss)"
  → "Skipping RSS feed discovery"                  ← the working path is disabled
  → fast HTML index parser runs
  → generic link pattern /(article|story|post)/    ← doesn't match these sites' slug URLs
  → "Found 0 article links from index page"
  → "Feed accessible but no new articles found"    ← logged as success
```

Evidence: `eastbournereporter.co.uk` profile was created **2026-06-19 14:01** — exactly when its feed went silent. `bournefreelive.co.uk` dropped the same day and will be re-validated against the broadened extractor / RSS path.

## The fix (4 parts)

**1. Clean up the poisoned data**
Remove/repair the auto-generated `scraper_domain_profiles` rows carrying `skip:['rss']` + `preferred:'html'` so RSS is reconsidered immediately. Restores eastbournereporter and any siblings created the same way.

**2. Stop the auto-learner from disabling the working path** (`universal-topic-scraper/index.ts`)
`autoLearnDomainProfile` must no longer write `skip:['rss']` off a single success. A success on one method is **not** proof another method is broken. Record `preferred` as a *hint* only; never let learning subtract a discovery method.

**3. Keep RSS as a fallback even when `html` is preferred** (`_shared/fast-track-scraper.ts`)
A preferred/learned `html` strategy must never hard-block RSS. If HTML parsing yields 0 articles, RSS still runs as a fallback unless RSS has been *explicitly and repeatedly* proven empty.

**4. Make index link-extraction less brittle** (`_shared/fast-track-scraper.ts`)
Broaden `extractArticleLinksFromIndex` so `uk_local` slug-style article URLs are detected (slug fallback like `regional_slug`), instead of only `/article|story|post/`.

## Making the plan foolproof — prevention (the part you asked for)

These changes ensure a silent self-inflicted outage like this can't recur unnoticed:

**A. "0 articles" is no longer a success.**
A run that fetches a page successfully but extracts **0 article links across all methods** should be recorded as a *soft failure / health warning* on the source, not `success_rate: 100%`. This is the single most important guardrail — it makes the failure visible instead of silent.

**B. Auto-learning can only ADD capability, never REMOVE it.**
Codify the rule: learning may set a `preferred` hint or add patterns, but may **never** populate a `skip` list that disables RSS/HTML discovery. Removing a method requires repeated, explicit proven-empty results — not one success.

**C. Stall detection on previously-stable sources.**
A source with prior steady volume that drops to 0 for N consecutive runs gets flagged for review (surfaced in source status / audit), so a future regression is caught in days, not weeks.

**D. Regression guard.**
Add a focused test in `supabase/functions/.../*_test.ts` covering: (i) a learned `html` profile still falls back to RSS when HTML yields 0 links, and (ii) `extractArticleLinksFromIndex` returns links for a slug-style `uk_local` index page. This locks the behaviour so a later "intelligence" tweak can't silently reintroduce the bug.

**E. Memory guardrail.**
Update the Scraping Intelligence memory so future work never encodes `skip:['rss']` from a single success and treats "0 articles extracted" as a failure signal.

## Verification

After the changes:
1. Force-rescrape `eastbournereporter.co.uk` and `bournefreelive.co.uk`.
2. Confirm in edge-function logs that RSS/HTML now return article links and new rows land in `topic_articles`.
3. Confirm a deliberately-empty extraction is now logged as a soft failure (guardrail A working).
4. Spot-check a few other sources to confirm no profiles were over-pruned.

## Risk / blast radius

Low and contained. Changes only widen discovery (re-enable a fallback, broaden a URL pattern, downgrade a misleading "success") — they don't remove any currently-working path. The data cleanup is scoped to profiles matching the exact poison signature. Other sources keep their existing behaviour.
