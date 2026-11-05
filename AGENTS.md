# Project Architecture Rules

- Render the Curatr identity through `src/components/brand/CuratrLogo.tsx`; one shared lock-up keeps the icon and `.pro` proportions consistent.
- Reuse `public/reveal.html` for explainer-film ident scenes; one reveal source keeps the animated mark and wordmark balanced everywhere.
- Dashboard visitor figures come only from `count_topic_visitors` (distinct external browser codes, prefix-stripped, across site_visits/story_interactions/story_impressions/feed_visits); one definition keeps every screen in agreement.
- Google Search figures come only from `search_daily` (system-only, filled daily by `search-console-sync`), counting only days 3+ days old; half-reported days never look like drops.
- Every SECURITY DEFINER stats function must start with `can_view_topic_stats` / `can_view_user_stats` and return nothing otherwise; this keeps tenants from reading each other's analytics.
- The /dashboard feed card reads all its figures from the single `get_dashboard_feed_cards` call; one guarded query keeps the card fast and tenant-safe.
- Feed-card highlights and nudges are picked by pure rules in `src/lib/feedHighlights.ts` from the single card call (no AI); keeps every positive true and testable.
