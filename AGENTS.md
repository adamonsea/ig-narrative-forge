# Project Architecture Rules

- Render the Curatr identity through `src/components/brand/CuratrLogo.tsx`; one shared lock-up keeps the icon and `.pro` proportions consistent.
- Reuse `public/reveal.html` for explainer-film ident scenes and deterministic video exports (`?clean=1&capture=1`, `window.__curatr.frame(t)` after fonts load); one reveal source keeps the animated mark and wordmark balanced everywhere.
- Dashboard visitor figures come only from `count_topic_visitors` (distinct external browser codes, prefix-stripped, across site_visits/story_interactions/story_impressions/feed_visits); one definition keeps every screen in agreement.
- Google Search figures come only from `search_daily` (system-only, filled daily by `search-console-sync`), counting only days 3+ days old; half-reported days never look like drops.
- Every SECURITY DEFINER stats function must start with `can_view_topic_stats` / `can_view_user_stats` and return nothing otherwise; this keeps tenants from reading each other's analytics.
- The /dashboard feed card reads all its figures from the single `get_dashboard_feed_cards` call; one guarded query keeps the card fast and tenant-safe.
- Feed-card highlights and nudges are picked by pure rules in `src/lib/feedHighlights.ts` from the single card call (no AI); keeps every positive true and testable.
- Every reader tracker (and GA) must pass `canTrackReader()` in `src/lib/visitorIdentity.ts` (not a bot, not "Essential only"); one gate keeps consent consistent.
- Reaction identities must preserve an existing `curatr_visitor_id` verbatim; stored anonymous reactions use exact ID matching, while new readers use the shared visitor identity.
- Headline stop data is written only via the `record_story_views` batch RPC (insert or upgrade seen→paused, today only), from an IntersectionObserver-only tracker that sends on pagehide/hide; keeps the feed fast and rows tamper-safe.
- Never create test accounts or trigger auth emails to made-up or non-existent addresses (e.g. tenant-test-b@curatr.pro); it caused a Supabase bounce-rate warning on 5 Nov 2026. Test tenant isolation via SQL with simulated JWT claims, or ask the owner for a real test inbox.
- Tenant Readership figures come only from the guarded `get_topic_readership` (same reads definition as the dashboard card); the Desk shows no stats, and the funnel appears only above `MEANINGFUL_READERS` weekly readers.
- Every per-story attention score (Readership top stopper, dashboard card highlight, widget Most read shelf, any future boost) comes only from `story_stop_scores` (position-corrected stop rate, `STORY_SCORE_FLOOR` distinct outside readers); it is revoked from app roles and called only by guarded functions, so one definition and one floor apply everywhere.
- The Desk pulse (reading now = last 5 min, per-story 7-day reads, rising = most reads in 3h, new arrivals since last look, milestones) comes only from the guarded `get_topic_pulse`, polled every 30s; "last looked" and milestone dismissals live in `curator_topic_state` per account so devices agree.
