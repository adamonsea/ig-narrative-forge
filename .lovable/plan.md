# Readers fix + Google Search in the feed card

## What I found (checked today)
- **Reader IDs don't match across tables.** Page visits are saved as `sv_<id>`, story swipes/opens as `visitor_<id>` – the same browser code with a different label in front. Reactions and swipes use a second, separate browser code. Story impressions saved nothing in the last 14 days.
- **Google can't see your feeds or stories.** Your robots file points Google to `curatr.pro/sitemap-dynamic.xml`, which returns "Not found" (the old forwarding rule doesn't work on Lovable hosting). The working sitemap file lists only 21 fixed pages – no feeds and no stories. This is probably why search traffic is close to zero. **This is the most important fix here.**
- A Google verification tag is already in the site's header.

---

## PART A – One reader count

**What I'll build**
- `count_topic_visitors` counts unique outside readers (`is_internal = false`) across page visits, story swipes/opens, story impressions and feed visits for that feed and date range.
- IDs are compared after removing the label (`sv_abc…` and `visitor_abc…` count as one reader).
- From now on, every tracker uses one shared browser code (`curatr_vid`), including reactions and swipes, so readers match across every table.
- Every screen still uses this one count. "Readers" can never be more than reads, and a reader who only swiped still counts.

**Can't fix backwards:** older swipes saved under the separate reactions code may count twice for the next week, until the shared code takes over.

---

## PART B – Google Search in the card

### Your steps (outside Lovable, about 15 minutes)
1. **Search Console:** open search.google.com/search-console → Add property → **Domain** → `curatr.pro`. Google gives you a TXT record (`google-site-verification=…`). Add it in your domain provider's DNS settings and press Verify. Use Domain rather than the meta tag, because it covers www, http and every subdomain. Keep the existing tag.
2. **Google Cloud:** go to console.cloud.google.com → New project ("Curatr Search").
3. Search for and **enable "Google Search Console API"**.
4. **IAM → Service accounts → Create** (name it "curatr-search"). No roles are needed. Open it → Keys → Add key → JSON, which downloads a file.
5. Back in Search Console → Settings → Users and permissions → **Add user**: paste the service account's email (`…@….iam.gserviceaccount.com`), permission **Restricted** (read-only).
6. When I ask, paste the **whole JSON file** as one secret named `GSC_SERVICE_ACCOUNT_JSON`. That's the only secret needed.

### What I'll build
1. **Fix the sitemap first** (needs no setup from you): serve the dynamic sitemap at a working address and point robots.txt to it. It will list every public, live, non-archived feed (feed, archive and briefings pages) and every published story and roundup. I'll remove the dead `sitemap-dynamic.xml` line. Pages will only get a "last changed" date when they have a real update time. After you publish, I'll submit the sitemap through Search Console.
2. **New storage table `search_daily`** (one row per date, feed and story or feed page): appearances in Google, clicks and average position, plus a `top_query` when Google provides one. No reader or app user can read it directly. Only the system writes it.
3. **Daily job (once a day, early morning):** asks Google for the last 5 days by page (and page+query for top queries). It matches URLs to feeds through `/feed/{slug}/…` and to stories through `/story/{id}`, and ignores everything else. It overwrites those 5 days each run, so late Google data fills in. **Only days at least 3 days old count as "final"**. Card figures use the last 7 final days against the 7 before, so a half-reported day never looks like a drop.
4. **Privacy:** Google hides rare searches. Totals come from page-level data, which is more complete, and query text is shown only when Google gives it. Per-query numbers are never added up to make totals.
5. **Card function:** `get_dashboard_feed_cards`, which already starts with the ownership check, adds `search_impressions_week`, `search_clicks_week`, `search_impressions_prev`, `top_search_story` (title and clicks) and `top_query`. Each owner only ever gets their own feed's paths.
6. **Card line (quiet, muted):** "Google: 1,240 views · 38 clicks this week". It's hidden until there's at least one final week with 10 or more views.
7. **Highlight picker additions** (rules only, no AI):
   - *Search up*: views up 25% or more, from at least 100 last week → "Your feed appeared in Google 1,240 times this week" (score 55).
   - *Top search story*: one story with 5 or more clicks → "'Pier reopens' was your top search story" (score 50). Nudge: **Share it**.
   - *Best search week*: after 4 or more final weeks, a new high of at least 200 views (score 65).
   - *Fallback ladder*: "Seen in Google N times since tracking began" (with at least 500 views), placed after total reads.
   - A drop is never a highlight. The line just shows the numbers in muted grey.
8. Tests are added to the existing highlight tests for the thresholds, and to prove a drop never gets a cheerful line.

### What we can't promise
- Small feeds may show little or nothing for weeks. Google needs to index pages first, and that depends on the sitemap fix plus time.
- Figures are 3 days behind, always.
- Search terms are often hidden for small sites, so "top search" will often be missing.
- Search Console counts appearances in results, not people, so it won't match reader numbers.
- Only curatr.pro pages are covered, not stories shown on other sites through the widget.

## Order
1. Part A and the sitemap fix (no setup needed from you)
2. Your steps 1–6
3. Search table, daily job and card line/highlights. The card stays hidden until data arrives.
