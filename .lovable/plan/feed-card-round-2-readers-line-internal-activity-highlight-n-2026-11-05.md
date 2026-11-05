# Feed card round 2: readers line, internal activity, highlight + nudge

## Part A — quick fixes

1. **Readers line** under the big reads figure: "Readers: 14 today · 62 this week". Both numbers come from `count_topic_visitors` (same definition as everywhere). "today" is hidden when it's 0; the whole line is hidden when the week is 0.
2. **Owner/admin activity flagged on the server.** Add `is_internal` (default false) to `story_interactions`, `story_impressions`, `feed_visits` and `story_swipes`. A before-insert trigger on each sets it to true when `auth.uid()` owns the topic or is an admin — the same pattern as the `site_visits` trigger. Every card figure filters `is_internal = false`. Insert-only logging stays as it is. Existing rows aren't changed.

## Part B — highlight picker

The card function returns the raw figures. The browser runs a small rule-based picker (no AI): each candidate that passes its minimum gets a score, and the top one is shown. Ties go to the order below. Every figure excludes internal activity.

| # | Candidate | Shows when | Score | Example copy |
|---|---|---|---|---|
| 1 | Subscriber milestone | total crossed 50/100/250/500/1000 in the last 7 days | 100 | "Eastbourne just passed 100 subscribers" |
| 2 | Best week ever | this week's reads > every earlier full week, at least 4 weeks of history, ≥ 30 reads | 90 | "Best week yet: 412 reads" |
| 3 | Story took off | top story this week ≥ 3× the feed's median story reads (over 4 weeks) and ≥ 25 reads | 80 + min(10, multiple) | "'Pier reopens' was read 3.4× more than usual" |
| 4 | Growth streak | reads up week on week for 3+ weeks in a row, each week ≥ 20 reads | 75 + 3 per extra week | "Reads up 4 weeks in a row" |
| 5 | Best day ever | yesterday or today beat every earlier day, ≥ 15 reads, at least 14 days of history | 70 | "Tuesday was your best day ever: 58 reads" |
| 6 | Reads up | ≥ 15% up and last week ≥ 20 reads | 50 + min(20, % ÷ 5) | "Reads up 32% on last week" |
| 7 | Readers up | ≥ 15% up and last week ≥ 10 readers | 45 + min(20, % ÷ 5) | "22% more readers than last week" |
| 8 | New referring site | a site sent ≥ 3 readers this week and none in the previous 4 weeks | 60 | "eastbourneunltd.co.uk sent you 12 readers" |
| 9 | New subscribers | ≥ 3 new this week | 40 + 2 per subscriber (max 60) | "8 new subscribers this week" |
| 10 | Returning readers up | return rate ≥ 25%, up ≥ 5 points, ≥ 10 readers last week | 55 | "1 in 3 readers came back this week" |
| 11 | New country | first reader from a country not seen before, ≥ 2 readers from it | 35 | "First readers from Ireland" |

The minimums stop "+100%" from 1 to 2 readers being cheered.

**Fallback ladder** (used when nothing above qualifies, including down weeks; first one that's true wins):
1. Stories read since launch ≥ 100: "4,210 stories read since launch"
2. Subscribers ≥ 10: "76 people chose to follow Eastbourne"
3. Most loyal reader ≥ 5 return days: "Your most loyal reader has come back on 23 days"
4. Stories published ≥ 10: "312 stories published to date"
5. Otherwise no highlight line.

**Honesty rules:** the copy never spins a drop. When reads are down, the % stays muted grey and the highlight comes only from items 1, 3, 5, 8, 9, 11 or the fallback ladder.

**Celebration:** a small accent (icon in the brand accent colour) on the highlight line. Milestones (item 1 and the 1,000/10,000 reads-since-launch markers) get a single short sparkle burst, shown once per milestone per user (remembered in the browser) and skipped when reduced motion is on.

## Part C — one nudge, matched to the highlight

| Highlight | Nudge | Links to (already exists) |
|---|---|---|
| Story took off / best day | "Share it" | Copies the story link; native share sheet on phones |
| New referring site | "Ask them to embed your feed" | Copies the widget embed snippet / opens the widget settings |
| New subscribers / subscriber milestone | "Turn on the subscribe prompt" | Feed's distribution settings (email/push toggles) |
| Reads/readers up, streak, best week | "Your readers are most active on Tuesdays" (shown when one weekday has ≥ 25% of 4-week reads) — otherwise "Share your feed" | No link for the weekday tip; feed URL copy for share |
| Any, when subscribers < 5% of weekly readers and ≥ 50 readers | "Readers like what they see — add a subscribe nudge" | Distribution settings |
| Fallback ladder | "Share your feed" | Copies the public feed URL |

At most one nudge. Each has a small × to dismiss; dismissals are remembered per feed and per nudge type in the browser. Before building, I'll confirm each target screen exists and drop any that don't.

## Example cards

**Good week (Eastbourne)**
```text
Eastbourne                         ● Live   · 2 reading now
412 reads this week   ▲ 32%   ▂▃▅▄▆▇█
Readers: 14 today · 62 this week
✦ "Pier reopens" was read 3.4× more than usual
  Share it →                                          ×
76 subscribers · 128 published this week
```

**Flat week**
```text
412 reads this week   ▲ 2% (grey)
Readers: 58 this week
✦ 8 new subscribers this week
  Turn on the subscribe prompt →                      ×
```

**Down week**
```text
290 reads this week   ▼ 18% (grey)
Readers: 3 today · 41 this week
✦ 76 people chose to follow Eastbourne
  Share your feed →                                   ×
```

**Brand-new feed (day 2)**
```text
Collecting your first week of readers
Readers: 2 today · 3 this week
(no highlight — nothing real to celebrate yet)
  Share your feed →                                   ×
```

## Data we don't have (flagged, not faked)
- **Towns:** we only store country, so "first reader from a new town" is left out.
- **Returning readers** use the browser-stored reader ID, which was reset in today's tracking change. Return-rate and loyal-reader highlights will stay quiet until about 2 weeks of history build up.
- **Best week/day and streaks** depend on history. Older visits were undercounted before the recent fixes, so these will only fire once there are 4+ clean weeks.
- **Push subscribers being the most engaged** can't be measured (we don't link reads to subscribers), so that nudge is left out.
- **Referring sites** come from the browser referrer, which many apps strip, so this undercounts.

## Technical details
- Migration: add `is_internal` and before-insert triggers on four tables (security definer, `auth.uid()` via subquery, admin through `has_role`). Update `count_topic_visitors`-dependent and card queries to filter it.
- Extend `get_dashboard_feed_cards` (still the single call, still gated by `can_view_user_stats`/`can_view_topic_stats`) with: `readers_today`, `readers_week`, `readers_prev_week`, `weekly_reads` (last 8 weeks), `daily_reads_max_prior`, `median_story_reads_4w`, `reads_total`, `published_total`, `new_referrer` (domain + count), `return_rate_week/prev`, `loyal_reader_days`, `new_country`, `top_weekday`, `subscriber_milestone`. Remove the fixed `insight_type/insight_text`.
- New `src/lib/feedHighlights.ts` with pure `pickHighlight(stats)` and `pickNudge(highlight, stats)`; `FeedStatsCard.tsx` renders them, plus a tiny CSS sparkle (no new dependency).
- Vitest tests for each threshold (e.g. 1→2 readers gives no highlight, a drop never yields reads-up copy, fallback order) and a cross-tenant test confirming user B gets nothing.
- Record the "highlights are rule-based on the client from the single card call" rule in AGENTS.md.
