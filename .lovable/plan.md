# One source of truth for reader figures

Counting and display only. Tracking/collection (record_* functions, trackers, consent) is untouched.

## 1. Vocabulary (owner-facing)

| Term | Meaning |
|---|---|
| Readers | Distinct non-internal, non-bot, non-test people with an engaged action (swipe, 3s+ headline stop, 10s+ story dwell) |
| Reads | Engaged story views |
| Sign-ups / Shares / Sent to sources | Counts, same window and exclusions |
| Rates | Always % of Readers or Reads, never row-over-row |

Window everywhere: last 7 full-or-partial Europe/London days vs the previous 7. Page loads (site_visits) become admin-only: "Page loads (incl. bots and bounces)".

## 2. Audit (current state, from the database and code)

| Surface | Lookup today | Counts today | After | Likely change |
|---|---|---|---|---|
| Readers tab headline | get_topic_readership (via topic_engagement) | Engaged readers, rolling 7×24h | topic_reader_metrics | Small (day boundary only) |
| Readers tab funnel | get_topic_engagement_funnel | Swipe-only "engaged" + site_visits "visitors", row-over-row % (the 500%) | Removed | Funnel disappears; "36 visitors" gone |
| Dashboard feed card | get_dashboard_feed_cards (topic_engagement + site_visits) | Readers + small "visits incl. automated" | Readers from shared function; visits line removed | Visits line disappears |
| Dashboard list (TopicManager) | get_user_dashboard_stats → _impl_user_dashboard_stats | Mix of site_visits and engagement | Shared function | Possibly noticeable if it shows visitors |
| Desk pulse (reading now, rising, per-story) | get_topic_pulse | topic_engagement, 5 min / 3h / 7d | Unchanged windows; reads per story from shared function | None expected |
| Feed insight panel | useTopicInsight → get_topic_engagement_averages / visitor stats | site_visits + feed_visits | Shared function (Readers/Reads) | Noticeable: visitor-based averages drop |
| Widget social proof | get_widget_social_proof (widget-feed-data) | site_visits + interactions | Readers from shared function | Noticeable: likely lower |
| Public feed live count | get_topic_live_readers (useHybridTopicFeedWithKeywords) | feed_visits heartbeats | topic_reading_now (5 min engaged) | Likely lower |
| Social proof cards | count_topic_readers (generate-social-proof-cards) | Engaged readers | Shared function | None |
| Popular stories | get_popular_stories_by_period | interactions only | Reads from shared function | Order may shift slightly |
| Admin SiteStats | get_site_stats / get_site_visitor_stats | site_visits | Kept, relabelled "Page loads (incl. bots and bounces)" | Label only |
| Story stop/swipe scores | story_stop_scores | Own definition (agreed rule) | Unchanged; denominators checked against Readers | None |
| Email/newsletter | No reader figures found in email functions | — | Verify during step 1; if any, switch | — |
| Unused helpers | get_topic_visitor_stats, get_topic_visitor_breakdown, count_topic_visitors, _impl_topic_interaction_stats | site_visits | Drop if no caller after migration | None |

Step 1 of the build produces real before/after numbers per feed for every row above, and I'll report any change over 10% before switching surfaces.

## 3. Build steps (each verified before the next)

1. **Measure.** Read-only comparison per feed: current figure vs new definition, for each surface. Report.
2. **Shared function.** `topic_reader_metrics(topic_id, from, to)` returning readers, reads, sign-ups, shares, sent_to_sources, stories_per_reader, stop %, swipe %. Built on existing `topic_engagement` and `topic_excluded_visitors`; London-day window helper `london_week_window()`. Internal (no app role execute); callers keep their guards (`can_view_topic_stats`).
3. **Rewire RPCs** to call it: get_topic_readership, get_dashboard_feed_cards, _impl_user_dashboard_stats, get_topic_engagement_averages, get_widget_social_proof, get_popular_stories_by_period, count_topic_readers, get_topic_pulse per-story reads. Same signatures, so screens keep working.
4. **Remove** EngagementFunnel.tsx, its use in ReadershipPanel, and get_topic_engagement_funnel. Remove the owner visits line from the dashboard card and insight panel; replace public live count with engaged reading-now.
5. **Admin consistency check** on the admin page: per feed, card Readers vs Readers tab Readers for the same window; shows "Match" or the two numbers in red. Also relabel SiteStats.
6. **Docs.** `docs/metrics.md` with the definitions; replace the reader rules in AGENTS.md with one rule pointing to `topic_reader_metrics`; update the reader-definition memory.
7. **Verify.** Tests for the window and rate maths (`readerStats.ts`), SQL checks with simulated owner claims for tenant isolation (no test accounts), admin check shows all matches, typecheck/build.

## Decision for you

- Window: "last 7 London days" — include today (partial) or only 7 completed days? Plan assumes **including today**, matching the Desk.
- Widget social proof: show Readers (lower, honest) or hide it below a floor (e.g. 30 readers)? Plan assumes **hide below 30**.
