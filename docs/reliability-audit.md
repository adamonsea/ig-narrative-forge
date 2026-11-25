# Reliability audit — 25 Nov 2026

## Recovery / emergency functions
| Function | Scheduled | Recommendation |
|---|---|---|
| auto-recover-stuck-stories | every 5 min | Merge into queue-processor (already resets stale jobs every minute) |
| queue-processor | every minute | Keep (core) |
| queue-alert-monitor | 15 min | Keep; now also sends feed-health red emails |
| daily-content-monitor | 4h AND 6h (two jobs) | Keep one job (drop `proactive-content-monitor`) |
| source-health-monitor | daily + `proactive-source-monitoring` 6h | Keep one; feed_health covers the owner view |
| topic-automation-monitor / universal-topic-automation | hourly / 2h | Review for overlap before merging |
| reset-stuck-processing, schedule-recovery, universal-platform-fix, ai-scraper-recovery | no | Retire to `_archived` (covered by queue-processor + health) |
| emergency-source-fix, emergency-scrape-fix, emergency-scrape-test | no | Retire to `_archived` |
| reactivate-eastbourne-sources | no | Retire (hard-codes one feed; breaks multi-tenant rule) |
| test-* , phase2-verification, clean-slate-migration, r | no | Retire to `_archived` |
Nothing removed yet; awaiting approval.

## Tenant isolation findings
Client-callable functions that take a feed id with no ownership guard:
- Stats any signed-in or anonymous caller can read for any feed: `get_swipe_insights`, `get_topic_quiz_stats`, `get_topic_engagement_stats` (notification/install counts), `get_daily_story_counts` (signed-in only).
- `get_subscriber_score(topic, email)`: anyone who knows an email can read that subscriber's play scores. `get_subscriber_leaderboard` shows masked emails (by design, public).
- `log_drip_feed_event`: anyone can write rows into system_logs.
- Scheduled jobs: all 40 loop per topic or are global cleanup; none mix tenants' output. feed_health is per topic and owner reads go through `can_manage_topic`.
Recommended fix: add `can_view_topic_stats` guards to the four stats functions, restrict the score lookup to the subscriber's own token, revoke anon on the drip logger. Each as its own step.

## Feed speed (mid-range phone, 4x CPU, 4G) — before any change
| | Eastbourne | Lisbon |
|---|---|---|
| First card | 4.4s | 4.0s |
| Largest paint | 5.2s | 4.4s |
| Longest blocking task at load | 1.35s | 0.59s |
| Scroll frame rate | 9 fps (66 long tasks) | 49 fps (3 long tasks) |
| Script | 457 KB | 457 KB |
| Images first screenfuls | 1.24 MB | 1.26 MB |
| Fonts | 88 KB | 88 KB |
Real visitors on feeds (last 7 days): LCP p75 2.6s (29 readings, too few to judge), CLS p75 0.10 (35).
Biggest causes to target: Eastbourne scroll jank (story cards re-rendering/measuring while scrolling), image weight, script size.
