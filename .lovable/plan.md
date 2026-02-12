

# Dashboard Statistics -- Radical Simplification

## The Problem

Each topic card on `/dashboard` currently contains:

1. **Content section** -- 2 stat boxes (Arrivals, Stories) + SourceHealthBadge, wrapped in a bordered card
2. **CollapsibleAudienceCard** -- visits today/week, week-over-week comparison, new/returning breakdown, return rate progress bar, geographic relevance -- all in a collapsible with 469 lines of code
3. **CollapsibleEngagementCard** -- Play Mode (liked/disliked/visitors), Feed Mode (engaged/completed/shares/source clicks/quiz), engagement funnel chart -- 245 lines
4. **EngagementSparkline** -- 3-line recharts sparkline with 7/14/30-day toggle -- 208 lines
5. **CollapsibleSubscribersCard** -- 4 stat boxes (homescreen week/total, registrants week/total) + email count + newsletter signups manager -- 137 lines
6. **TrafficHealthAlert** -- banner at top with per-topic traffic drop warnings

That's **5 separate data-fetching components per topic card**, each making their own Supabase queries, wrapped in collapsibles with tooltips on every number. A user with 3 topics triggers 15+ API calls on page load for stats that mostly show single-digit numbers.

This violates every principle of the minimalist dashboard philosophy.

## Design Direction

A dashboard overview card should answer ONE question: **"How is this topic doing?"** -- at a glance, in under 2 seconds.

Think: GitHub repository cards, Vercel project cards, or Stripe dashboard tiles. They show 2-3 numbers and a trend indicator, not a full analytics suite.

## Proposed Redesign

### New Topic Card Layout

```text
+--------------------------------------------------------------+
|  [Logo]  Topic Name                    [Feed] [Archive]       |
|          3 in arrivals  ·  12 published  ·  5/6 sources       |
|                                                                |
|  Visitors        Engagement       Subscribers                  |
|  142 this week   78% approval     23 total                     |
|  +12% WoW        4.2 avg engaged                              |
|                                                                |
|  [__________sparkline (visitors only)__________]               |
+--------------------------------------------------------------+
```

### What changes:

**1. Replace 4 collapsible cards with a single inline stats row**

Instead of Content/Audience/Engagement/Subscribers as separate expandable sections, show 3 compact stat columns inline:
- **Visitors**: weekly count + WoW change (replaces entire CollapsibleAudienceCard)
- **Engagement**: approval rate + avg engaged (replaces entire CollapsibleEngagementCard)
- **Subscribers**: single total number (replaces entire CollapsibleSubscribersCard)

No collapsibles. No expand/collapse. Just the numbers.

**2. Move the Content stats into the subtitle line**

"3 in arrivals . 12 published . 5/6 sources" as a text line below the topic name. These are operational counts, not analytics -- they belong as metadata, not stat boxes.

**3. Simplify the sparkline to visitors-only**

The current sparkline shows 3 overlapping lines (swipes, shares, visitors) which is hard to read at small size. Show only the visitors line -- the single most important trend. Remove the 7/14/30-day toggle (default to 7 days).

**4. Remove TrafficHealthAlert as a separate component**

Integrate the traffic warning directly into the topic card's WoW indicator. If traffic is down >50%, the WoW percentage turns red with a small warning icon. No separate banner needed.

**5. Remove all Tooltip wrappers from the dashboard**

Every number currently has a Tooltip explaining what it means. On a dashboard you visit daily, this is noise. The labels are self-explanatory.

**6. Kill the collapsible detail views entirely**

The new/returning breakdown, geographic relevance, Play Mode vs Feed Mode split, funnel visualization, and newsletter signups list should live on a dedicated analytics page (accessed via a "View Analytics" link), not crammed into the overview card.

## Technical Changes

### Files Modified

**1. `src/components/TopicManager.tsx`** (major simplification)
- Remove imports for `CollapsibleAudienceCard`, `CollapsibleEngagementCard`, `CollapsibleSubscribersCard`, `TrafficHealthAlert`, `SourceHealthBadge`
- Remove `TooltipProvider` wrapping
- Replace the 4-section stats grid (lines 337-422) with a single 3-column inline row
- Move content counts (arrivals, published, sources) into a subtitle text line
- Simplify sparkline: pass a `minimal` prop or replace with a visitors-only version
- Remove the footer badges section (Regional/General badge, Status badge, keywords tooltip, created date) -- this is clutter that adds no value to daily use
- Keep only: topic name, logo, subtitle stats line, 3 stat columns, sparkline, action buttons

**2. `src/components/EngagementSparkline.tsx`** (simplify)
- Add a `minimal` mode that shows only the visitors line, no toggle buttons, no multi-line chart
- Reduce height from `h-16` to `h-10` for dashboard context
- Remove the time range toggle buttons in minimal mode

**3. Components NOT deleted but no longer imported by TopicManager:**
- `CollapsibleAudienceCard.tsx` -- may be reused on a future analytics page
- `CollapsibleEngagementCard.tsx` -- same
- `CollapsibleSubscribersCard.tsx` -- same
- `TrafficHealthAlert.tsx` -- replaced by inline WoW indicator
- `SourceHealthBadge.tsx` -- moved to subtitle line as text "X/Y sources"
- `EngagementFunnel.tsx` -- future analytics page

These components stay in the codebase but are decoupled from the dashboard overview.

### Data Changes

The `get_user_dashboard_stats` RPC already returns all needed data. The subscriber counts are already fetched in `loadTopics`. No new queries needed. In fact, this change **reduces** API calls because we stop mounting 5 child components that each run their own queries (SourceHealthBadge, week comparison in Audience, visitor breakdown, funnel data, sparkline interactions).

The source health count (X/Y) can be derived from the existing `get_user_dashboard_stats` if it includes source counts, or from a lightweight query added to the parallel `Promise.all` in `loadTopics`.

### No database or edge function changes required.

## Before/After

| Aspect | Before | After |
|--------|--------|-------|
| Stat sections per card | 4 collapsible + sparkline + alert | 1 inline row + sparkline |
| API calls per topic | 5+ (health, breakdown, funnel, sparkline, sources) | 1 (consolidated RPC + sparkline) |
| Lines of code in card | ~120 lines of JSX per topic | ~40 lines |
| Tooltips per card | 12+ | 0 |
| Collapsible interactions | 4 expand/collapse | 0 |
| Visual elements per card | ~20 stat boxes, badges, progress bars | ~6 numbers + 1 sparkline |
| Footer metadata | 5 items (type badge, status badge, keywords, date, actions) | 2 items (Feed link, Archive) |

The result: a dashboard that loads instantly, communicates health at a glance, and gets out of the way so curators can click into the topic that needs attention.

