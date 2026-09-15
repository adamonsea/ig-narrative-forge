# Roadmap — scraping overhaul

Safety rule (non-negotiable): every change is additive and fail-open. If a new
discovery method, AI fallback or logging step errors, the existing scraping path
runs exactly as it does today. No existing function is deleted until a grep of
`src/`, the edge functions and pg_cron proves nothing calls it. No behaviour
change to writing, approval, publishing, feeds, widgets or emails.

- [ ] 1. `scrape_runs` table + per-run recording (additive; failures swallowed)
- [ ] 2. Health monitor reads real reasons from `scrape_runs`
- [ ] 3. New discovery strategies: news sitemap, sitemap, JSON-LD (tried only
      after existing methods return nothing)
- [ ] 4. Preferred-method memory per source in `scraping_config`
- [ ] 5. Conditional GET (ETag / If-Modified-Since), 304 = clean run
- [ ] 6. AI last-resort extraction, capped per run and per day
- [ ] 7. Retire unused scraper functions (only after call-site proof)
- [ ] 8. Re-run failing Eastbourne sources and report results
