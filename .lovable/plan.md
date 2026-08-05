# Shrink the Curatr database

Images are not the problem. I measured the database, and the growth is almost entirely **job history logs**, not content.

## What's actually on disk

| What | Size | Notes |
|---|---|---|
| `cron.job_run_details` (scheduler history) | **571 MB** | 664,851 rows going back to 19 Aug 2025. 651,347 are older than 7 days. Nothing reads them. |
| Write-ahead log (WAL) | **1 GB** | Grows with churn; shrinks once churn drops |
| `net._http_response` (pg_net replies) | 66 MB | Only 522 live rows — the rest is bloat |
| Everything your app owns (`public`) | **247 MB** | The whole product: articles, stories, slides, sources |
| Storage bucket (images) | 3.4 GB | Billed as Storage, **not** on this 8 GB disk |

Within `public`, the largest items are `articles` (54 MB), `shared_article_content` (48 MB of scraped article bodies), `slides` (19 MB), `stories` (16 MB) and `visuals` (12 MB — only 42 rows, so that is dead-row bloat left over from the earlier base64 clean-up).

So one scheduler log table is more than twice the size of the entire product.

## The fix

**1. Purge and cap the cron history (frees ~560 MB)**
Delete `cron.job_run_details` rows older than 7 days, then add a nightly job that keeps only the last 7 days. There are 29 cron jobs, several running every minute — that is roughly 50k rows a week, so the ongoing cap matters more than the one-off delete.

**2. Cap pg_net response history (frees ~60 MB)**
Same pattern on `net._http_response`: nightly delete of anything older than a day, plus a reclaim.

**3. Reclaim bloat on the churny tables**
Run a full reclaim on `visuals`, `articles`, `shared_article_content` and `net._http_response` so freed pages go back to the operating system instead of sitting as empty space. This takes brief table locks, so it runs once, off-peak.

**4. Archive retention for scraped article bodies (frees ~30-40 MB and stops future growth)**
`shared_article_content` keeps the full scraped body of every article forever — 5,745 rows are over 180 days old, and 3,786 rows in `articles` are too. Once a story is published, the body is only needed for duplicate detection, which works off the checksum and title. A nightly job blanks the body on rows older than 180 days that have no unpublished story attached, keeping the row, URL, title, checksum and attribution intact. Duplicate detection, feeds and published stories are unaffected.

**5. Storage-side image trim (optional, separate budget)**
The 3.4 GB of images sits in Storage, not on this disk, so it does nothing for the 8 GB warning — but if you want that bill down, a job can delete original-size renders for stories older than 12 months and keep only the WebP feed variant. Worth doing second, after the disk issue is closed.

## Expected result

Disk usage drops from roughly 1.9 GB of real data to about **300-400 MB**, with retention jobs holding it there. You can then manually resize the disk back down from 12 GB once usage settles.

## Technical notes

- One migration adds three retention functions plus `cron.schedule` entries for them, staggered off the busy minute slots.
- The one-off purge and `VACUUM FULL` run as separate direct statements rather than inside the migration, since VACUUM cannot run in a transaction.
- The body-blanking job checks story status before clearing, so nothing in the pipeline loses source text mid-flight.
- No changes to feeds, the scraper, RLS or any UI.