# Project Architecture Rules

- Render the Curatr identity through `src/components/brand/CuratrLogo.tsx`; one shared lock-up keeps the icon and `.pro` proportions consistent.
- Reuse `public/reveal.html` for explainer-film ident scenes; one reveal source keeps the animated mark and wordmark balanced everywhere.- Dashboard visitor figures come only from `count_topic_visitors` (site_visits, feed/story/play, last 7 days incl. today, `is_internal = false`); one definition keeps every screen in agreement.
- Every SECURITY DEFINER stats function must start with `can_view_topic_stats` / `can_view_user_stats` and return nothing otherwise; this keeps tenants from reading each other's analytics.
- The /dashboard feed card reads all its figures from the single `get_dashboard_feed_cards` call; one guarded query keeps the card fast and tenant-safe.
