# Roadmap — scraping overhaul

Saved ident video replacement (6 November 2026)
- [x] Measure original formats and start points; deterministically render the new reveal.
- [x] Upload three new assets and audit references (no original video references in app code).
- [x] Verify matching media properties and quartered marks at each ending; do not publish.

Logo replacement (6 November 2026)
- [x] Replace supplied ident, shared logo and promo end mark exactly.
- [x] Render matching favicon sizes and maskable app icon from SVG.
- [x] Audit other code marks, raster images and videos; update social preview only if needed.
- [x] Verify logo rendering and report changed and untouched assets without publishing.

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

Headline attention — Phase 1 (9 November 2026)
- [x] Record each card's feed position with headline views (scroll depth = deepest position reached)
- [x] One position-corrected story score with a 30 outside-reader floor
- [x] Readership: scroll drop-off curve + top headline stopper (replaces "Most eye-catching")
- [x] Widget "Most read" shelf ranked by the same score, Featured below the floor
- [ ] Phase 2 automatic boost — not to be built until a feed nears 150 weekly readers

Feed ordering
- [x] Old stories slot into the feed/pipeline at their original publication date
      (anything older than 3 days no longer jumps to the top)
- [ ] Pin a story to the top of the feed — lets an owner deliberately surface a
      late-but-great story that would otherwise sit at its original date

Membership, premium triggers and credits
- [x] Audit real provider costs and define one credit scale
- [x] Build an idempotent credit ledger and server-side Pro access rules
- [x] Replace public tiers with Free sandbox + one Pro membership + top-ups
- [x] Gate distribution consistently and preserve interrupted actions
- [x] Add Cartoon, Aged editorial photo, Anime and Illustrated icon styles
- [x] Unify low-cognitive-load billing and credit messaging
- [x] Verify checkout, renewal, cancellation, vouchers, failures and mobile access

Explainer film identity and sound
- [x] Add a shortened identity sting before narration
- [x] Add the complete identity reveal after narration
- [x] Keep one continuous upbeat analogue bed and duck it under presenter speech

Public feed sign-up card (9 November 2026)
- [x] Feed-branded card after stories 3, 13, then every 15
- [x] Story cards: fit-to-card text, one clean last slide (screenshots shown)
- [ ] Story cards: hide "Read the full story" sentences and closing reader questions — waiting on Adam's yes/no
- [x] Bring back Daily / Weekly / Both (Both = two rows, as before)
- [ ] Both sends one confirmation email instead of two — needs Adam's go-ahead (changes the sign-up and confirm services)
- [x] Tinted, contrast-checked card surface so it stands apart from stories
- [x] Body slides 2+ in Lexend 300, tighter tracking and line height, shared with the fit-to-card measurer
