# Scraping overhaul: more sources working, one clear path, honest diagnostics

## Where things stand (checked today)

- In the last 7 days, 17 sources produced zero articles, including Eastbourne Herald, East Sussex County Council, EB Chamber UnLtd, South Downs National Park, sussex.press and eastsussex.news. Two more are outright broken feeds (Civil Society News, Third Sector).
- Across every feed, only 62 articles were taken in the last 14 days; weekly totals have sat between 9 and 46 for three months.
- Almost every failure is recorded as the catch-all "no new URLs", which tells you nothing about whether the site blocked us, changed layout, or genuinely published nothing.
- There are over 40 overlapping scraping tools in the backend, only one of which is really used. The rest are old experiments and one-off fixes that still cost time to reason about and can be triggered by stray buttons.
- Pages are re-fetched in full every run, even when nothing changed.

## What will change

### 1. Find stories in more ways (biggest win on volume)

Today a source is mostly tried as a feed, then as a listing page. The new order tries each method in turn and remembers which one worked for that site:

```text
1. RSS / Atom feed
2. News sitemap, then regular sitemap (sitemap.xml, sitemap_index.xml, robots.txt pointer)
3. Structured data already embedded in the page (JSON-LD article listings)
4. Listing-page HTML parsing (current behaviour)
5. Rendered fetch for JavaScript-heavy sites
6. AI read of the page as a last resort
```

This adds sitemaps, structured data and the AI last resort to the main path. Council, chamber, arts-venue and gov sites — the ones failing now — almost all publish sitemaps or JSON-LD even when they have no feed.

### 2. AI last-resort extraction

When every free method returns nothing usable, the page is handed to an AI reader that pulls headline, date, author, body and image. Capped: only on sources that produced nothing by other means, at most a few pages per source per run, with a per-day ceiling so it can never run away with cost. The result is recorded so a source that only ever works this way is visible to you.

### 3. Honest diagnostics per run

A new run record per source per scrape, storing: method used, URLs discovered, URLs already seen, new URLs, articles kept, and a counted reason for every rejection (too old, off-topic, low quality, duplicate, extraction failed, blocked, feed missing). The source health email and the admin panel then say "found 14 URLs, 14 already seen" or "blocked with 403" instead of "no new URLs".

### 4. Don't re-fetch what hasn't changed

Store the ETag / last-modified value per source and send it on the next run. Unchanged feeds return an empty, near-free response. Cuts both time and bandwidth on every scrape.

### 5. Retire the sprawl

Keep the live path (universal-topic-scraper and its shared helpers, the Firecrawl and Beautiful Soup fallbacks, source health monitoring, chamber events, manual upload extraction). Delete the one-off and superseded functions — the emergency fixes, the reactivate-X scripts, the duplicate scrapers, the test harnesses — after confirming nothing in the app or the schedules calls them. Any UI buttons pointing at deleted tools are removed with them.

## What will not change

- No change to how stories are written, approved or published.
- No change to the feeds, widgets or emails.
- Existing articles and sources are untouched; nothing is deleted from your content.

## Technical notes

- New `_shared/discovery.ts`: ordered strategies (rss, news-sitemap, sitemap, jsonld, html-listing, rendered, ai-extract) behind one interface, each returning candidate URLs plus provenance. `content_sources.scraping_config` gains `preferred_discovery`, written back on success and tried first next run; failure demotes it.
- Sitemap strategy: try `/sitemap_index.xml`, `/sitemap.xml`, `/news-sitemap.xml`, and any `Sitemap:` line in `robots.txt`; parse `<url><loc>` plus `news:publication_date`/`lastmod`; filter to the freshness window before fetching anything.
- JSON-LD strategy: parse `application/ld+json` blocks for `ItemList`, `Blog`, `NewsArticle` entries on the listing page.
- AI extraction: Lovable AI Gateway, `google/gemini-3-pro-image` is not needed — use the default chat model on cleaned page text, JSON-mode response of `{title, published_at, author, body, image_url}`. Guarded by `ai_extract_enabled` on the source, a per-run cap (default 3 pages) and a per-day global cap; every call is logged to the run record with token cost.
- New table `public.scrape_runs` (`id, source_id, topic_id, started_at, finished_at, method, urls_discovered, urls_new, articles_stored, rejections jsonb, error_code, error_detail`) with owner/admin RLS plus explicit GRANTs (service_role full, authenticated select via topic ownership). `source-health-monitor` reads the newest run per source for its reason code instead of guessing.
- Conditional GET: store `etag`/`last_modified` in `scraping_config`; send `If-None-Match`/`If-Modified-Since`; treat 304 as a clean, zero-cost run rather than a failure.
- Cleanup list is confirmed by grepping `src/` and the pg_cron schedules for each function name before deletion; functions referenced by anything stay.

## Order of work

1. `scrape_runs` table, run recording, health monitor reading real reasons.
2. Discovery strategies (sitemap, JSON-LD) plus preferred-method memory.
3. Conditional GET.
4. AI last-resort extraction with caps.
5. Retire unused functions and their stray UI.
6. Re-run the failing Eastbourne sources and report what each one now returns.
