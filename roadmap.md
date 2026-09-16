# Roadmap — scraping overhaul

Safety rule (non-negotiable): every change is additive and fail-open. If a new
discovery method, AI fallback or logging step errors, the existing scraping path
runs exactly as it does today. No existing function is deleted until a grep of
`src/`, the edge functions and pg_cron proves nothing calls it. No behaviour
change to writing, approval, publishing, feeds, widgets or emails.

- [x] 1. `scrape_runs` table + per-run recording (additive; failures swallowed)
- [x] 2. Health monitor reads real reasons from `scrape_runs`
- [x] 3. New discovery strategies: news sitemap, sitemap, JSON-LD (tried only
      after existing methods return nothing)
- [x] 3b. Attribution guard: discovered URLs must be on the source's own domain
- [ ] 4. Preferred-method memory per source in `scraping_config`
- [ ] 5. Conditional GET (ETag / If-Modified-Since), 304 = clean run
- [x] 6. AI last-resort extraction, capped per run (3) and per day (200)
- [ ] 7. Retire unused scraper functions (only after call-site proof)
- [x] 8. Re-run failing Eastbourne sources and report results
      - Eastbourne Herald: site now 301s to Sussex Express — needs repointing
        or removing (decision with owner)
      - South Downs National Park: recovered, 4 stories stored
      - East Sussex County Council: 10 links read, none passed relevance

Published queue steadiness (plan: .lovable/plan/steady-up-the-published-queue-2026-09-15.md)
- [x] Single source of truth: admin RPC primary, direct query fallback-only
- [x] Slides never silently missing: inline slides preferred, last-good slides
      kept on fetch failure, "Slides loading — refresh" state in the list
- [x] Parliamentary filter fail-open (failed filter keeps stories visible)
- [x] 30s fallback poll stands down when realtime is live or tab hidden
- [x] Load-error toasts replaced by one quiet inline banner with retry
- [x] Thumbnails via Supabase image transformation + lazy loading

Feed ordering
- [x] Old stories slot into the feed/pipeline at their original publication date
      (anything older than 3 days no longer jumps to the top)
- [ ] Pin a story to the top of the feed — lets an owner deliberately surface a
      late-but-great story that would otherwise sit at its original date
