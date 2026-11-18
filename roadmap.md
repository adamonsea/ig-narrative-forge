# Reader feed switch (18 Nov 2026)
- [x] Events | All | News pill at the top of feeds with both; Events pages events 20 at a time; News drops event cards

# Story cover styles (18 Nov 2026)
- [x] Admin-only /design/story-covers: real Eastbourne stories, Split (now) beside Full bleed
- [x] Owner switch in Feed Settings (Split / Full bleed)

# Events in briefings (18 Nov 2026)
- [x] Daily briefing page: the day's news + events today & tomorrow; weekly: the week's news + the week ahead
- [x] Events-led or news-less feeds (Lisbon) get a briefing with events first; old briefings show no events
- [x] Weekly email uses the same week-ahead rule; events-led emails put events first; empty sends skipped

# Workspace design-rule fixes (17 Nov 2026)
List: .lovable/reviews/workspace-rule-breaks.md. One group at a time; Adam picks the order.
- [x] Dashboard and new-feed setup
- [x] Shared building blocks
- [x] Desk
- [x] Sources
- [x] Settings, Readership, Reviews — Adam skipped picking the order, so these three were done in that order
- [x] About page and donations auto-save (Adam chose, 17 Nov)
- [x] Parked or hidden panels keep their tiny text by choice (skipped, 17 Nov)

# Sources as cards + Desk fixes (17 Nov 2026)
- [x] Sources: News / Events shelves of cards (name, health colour, 7-day dots, one number); needs-attention pinned on top
- [x] Sources: one Gather (no separate force rescrape); click card opens Desk-style side panel with everything else
- [x] Sources: health from each source's own rhythm (amber = quiet 2-3x normal gap; red = repeated errors or nothing in 14 days); tests
- [x] Sources: Archived fold replaces Show Disabled (restore / remove)
- [x] Desk: Live now shows what's in the feed
- [x] Desk: Brighton Dome event flagged out of area (Eastbourne); Hastings stays local (Adam, 17 Nov)
- [x] Desk: Coming up shows all events (no 60 cap)

# Desk redesign: news and events, clean cards (16 Nov 2026)
Plan: .lovable/plan/desk-redesign-news-and-events-clean-cards-2026-11-16.md. One phase at a time, stop after each for Adam to test. Presentation only; nothing removed, only moved.
- [x] Phase 1: story cards with three states (rest / hover / drawer), filter popover, slim processing rows
- [x] Phase 2: Desk in three areas (Story pool / Live now / Event pool)
- [x] Phase 2b: tinted pools with inward arrows, Autopilot tag, header counts removed, fold-out Published / Events ahead figures
- [ ] Phase 3: motion hooks (desk-arrive, desk-to-live, desk-expire, desk-drawer) — waits on Adam testing Phase 2

# Reader stats — one credible definition of a real reader (14–16 Nov 2026)
Rules: tracking and dashboard only; per-tenant, owner-only; never delete data.
- [x] A1. Readers = swiped, paused 3s+ on a headline, or 10s+ on a story page; internal/test excluded
- [x] A2. Stories read uses the same rule (bare story-page load is not a read)
- [x] A3. "Visits" shown separately, smaller, no arrow, labelled as including automated traffic
- [x] B5. Remove +15 reader padding in AutomatedInsightCard; audit other boosts
- [x] B6. Exclude v_test / "test" UA visitors everywhere; own tests use excluded prefix
- [x] B7. Find why 5 real swipers have no site_visits row; fix
- [x] B8. Explain zero story_impressions on 14 Nov (tracking failure vs story pages)
- [x] C9. Human-gated visit tracking (touch/pointer/scroll/key/swipe), no feed slowdown
- [x] C10. Dashboard leads with weekly: readers, returning readers, where readers came from
- [x] C11. Feed-level stop/swipe rates until a story has 30 readers
- [x] C12. Daily self-check note: visits up sharply while readers flat = likely automated
- [x] Finish: Eastbourne 14-day per-day old vs new visitors/readers and reads

# Simplification — "a 10-year-old can run a feed" (13 Nov 2026)
Rules: hide or switch off, never delete; existing feeds keep values; specialist features move out of sight.
- [x] 1. New feed in one sentence: "What's your feed about?" → one preview → "Looks good"; Autopilot on for new feeds
- [x] 2. One "What we look for" panel: More of this / Less of this
- [x] 3. One Brand screen: name, logo, colour, one-line welcome
- [x] 4. One Autopilot setting (on/off + pace); per-source Auto-publish stays
- [x] 5. Share & grow basics (sign-ups, weekly roundup, widget code); rest under Advanced
- [x] 6. Folded "Extras" group at bottom of Settings; off by default for new feeds
- [x] 7. Plain language for new owners; list changed labels
- [x] 8. Family-safe (setup choice, see below) + no trademarked characters/logos in pictures
- [x] Clarification (08:56): simple by default, deep on demand — every capability within one tap; remember open Advanced/Extras per owner; Desk keeps full power; professional tone; add "Set it up myself" path
- [x] Family-safe NOT default for news; offered at setup, suggested on for hobby/fandom/kids topics, owner decides
- [x] Report: Eastbourne owner capability map (what they can do today → where it lives now)
- [ ] Test: create real "Pokémon" feed, time it, report taps/screens/stuck points/story safety; leave unpublished & private — BLOCKED: preview sign-in cannot be simulated for this project; Adam to run it, then check stories/pictures

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
- [x] Story cards: hide "Read the full story" sentences and short closing reader questions (approved 9 Nov)
- [x] Bring back Daily / Weekly / Both (Both = two rows, as before)
- [ ] Both sends one confirmation email instead of two — needs Adam's go-ahead (changes the sign-up and confirm services)
- [x] Tinted, contrast-checked card surface so it stands apart from stories
- [x] Body slides 2+ in Lexend 300, tighter tracking and line height, shared with the fit-to-card measurer

What's-on events MVP (12 November 2026)
- [x] Retire ai-event-generator, automated-event-scheduler, api-event-collector (Chamber import untouched)
- [x] One reader for pasted pages: JSON-LD → iCal/JSON → text kept only with on-page dates; robots.txt; daily refresh
- [x] Sources tab: Add a what's-on page → preview → save; events auto-publish; owner delete-on-card enabled
- [x] Broken-source flag after two empty checks in a row
- [x] Venue click tracking + Readership line
- [x] Tested on Eastbourne pages (test data removed afterwards)

Events: one home and one sources list (12 November 2026)
- [x] Report why new events weren't visible (feed never loaded the Events switch)
- [x] Events switch + "Show in the feed" tick box in Sources > What's on; old toggles removed
- [x] event_sources holds every kind (what's-on page, calendar feed), auto-detected, with status/refresh/edit/remove
- [x] What's on card sets in the feed (mock approved): 14 days, soonest first, 3–4 per set, next set at each events slot
- [x] Location filter on place-based feeds: out-of-area / online events left out automatically, listed in Sources with "Put back"
- [x] Owner removes an event from its card (with Undo); removals and put-backs stick by event name across the feed
- [x] Old Chamber importer no longer brings back removed events
- [ ] Drop topics.event_source_url and retire ingest-chamber-events — new reader matches it; waiting on Adam's go-ahead
- [ ] Add BN20 to Eastbourne's postcodes? (Meads/Old Town) — waiting on Adam; filter already copes when the address names Eastbourne

Events + Desk clickable mocks (12 November 2026)
- [x] Hidden owner-only route /dashboard/mock/events-desk, dummy data only, live Desk and feed untouched
- [x] Mock 1: What's on story-style card (cover + one event per slide, Tonight/This weekend/Next week, up to 8 in 14 days), placed after story 1 then every 15+, never beside another extra; phone + desktop
- [x] Mock 2: one-screen Desk (Waiting mixed stories/events → Live in feed order with What's on in place) and Sources with Auto-publish and auto-detected kind
- [x] Adam reviewed and approved the mocks; mock route removed after the real build

One pipeline for stories and events (12 November 2026)
- [x] Data: events get a Waiting status and a local-relevance score; events sources get Auto-publish (existing sources on)
- [x] Reader: score events like news, out-of-area → Hidden, never auto-publish out-of-area/low-relevance; new sources wait
- [x] Desk: Waiting (stories + events, one-tap Publish/Skip, collapsed Hidden) above Live (What's on row in feed position, Show in the feed); Events switch in the Desk
- [x] Sources: one list for news and events, kind detected from the link, no event items or switches
- [x] Feed: What's on card set (cover + one event per swipe), next 14 days, up to 8, after story 1 then every 15+, click tracking
- [x] Remove the mock route; leave event_source_url and the old Chamber importer alone
- [x] Check end to end on Eastbourne: arrive → Waiting → Publish → Live → feed card → weekly email events (rendered email preview and signed-in Desk screens not viewable from here)

Park six features + tidy keywords (13 November 2026)
- [x] Report which of the six were on for Eastbourne before switching anything off
- [x] One switch file for Community discussion, Parliament, Sentiment, Email segments, Audio briefings, Family-safe (all off); jobs return early, screens hide, saved values untouched
- [x] docs/parked-features.md: what each does, why parked, how to bring it back
- [x] What we look for: one place for terms, case-insensitive, one list per term with "Moved from…" note, compact long lists with search, suggestions inline, Clean up past stories asks first
- [x] Check Eastbourne feed + values after (signed-in Desk/Settings/setup screens not viewable from here)

# Design unify sweep — finish (17 Nov 2026)
- [x] Shared drawer (bottom sheet on phones, fade only); move AI-assistant connection, feed backups, feed safety, email preview, legacy edit-source, link editor, slide editor, animation instructions, Add story into it
- [x] About page and donations: auto-save with save dot, no Save buttons
- [x] Categories: one primary button
- [x] /design live-pulse: white on mint in the Live now bar; pop green elsewhere
- [x] Other owner-visible open items in the review file

# Events-led feeds — Phase 1 follow-ups (17 Nov 2026)
- [x] Lisbon source → agendalx English list (?lang=en); one gather; report English titles / descriptions / non-Other categories
- [x] Per-feed currency (default from country: € Lisbon, £ UK); prices "€12" / "Free"; hidden when unknown
- [x] Category fallback: model in a background job after saving; never blocks; never overwrites owner choice
- [x] Events-led feeds page 20 at a time (news paging rules); smooth swiping
- [x] Events-led feeds: extra cards count positions against events
- [x] Widgets page: 17 tiny-text spots to the type scale

# Event photos on cards (18 Nov 2026)
- [x] Collect listing pictures (JSON-LD, JSON feeds incl. Agenda LX); skip placeholders
- [x] Save checked, resized copies in topic-assets; never hotlink
- [x] Delete after the event, when hidden/removed/changed, orphan sweep — in the twice-daily gather
- [x] Individual cards show the photo, illustration fallback; grouped cards/email unchanged
- [x] Desk "Use illustration" / "Use photo"; Feed Settings "Event photos" switch
