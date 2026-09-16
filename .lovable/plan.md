# A live newsroom view: insight on top, Arrivals beside Live

Today the Pipeline page hides Arrivals and Stories behind two tabs, so you only ever see half your newsroom, and the "at a glance" summary lives on a different page inside Editorial control. This plan brings them together into one working view.

## The new Pipeline page

Top to bottom:

```text
+--------------------------------------------------------------+
|  Live insight strip  (visitors · live stories · gathered 7d)  |
|  small trend chart of stories gathered & published per day    |
+----------------------+---------------------------------------+
|  ARRIVALS  (1/3)     |  LIVE  (2/3)                          |
|  newest first        |  published stories, newest first      |
|  compact review card |  fuller cards with popularity + source|
|  approve / discard   |                                       |
+----------------------+---------------------------------------+
|  Sources (collapsed, unchanged)                               |
+--------------------------------------------------------------+
```

- **Arrivals and Live side by side.** The two tabs become two columns on desktop — one third for Arrivals, two thirds for Live. You can see what's waiting and what it will sit next to.
- **Visual relationship.** When an arrival is approved it animates from the left column into the top of the right column, with a "being prepared" placeholder while the story is generated, so the flow from raw article to live story is visible rather than implied.
- **"Stories" is renamed "Live."** Arrivals / Live becomes the vocabulary everywhere on this page. Drafts and ready-but-unpublished items keep a small state label inside the Live column.
- **Mobile.** Below tablet width the columns stack: a compact Arrivals summary with a count at the top, Live beneath it, plus a simple switch between the two so small screens aren't cramped.

## The insight strip

The "Current flow" summary moves out of Editorial control and sits above the two columns, widened from counters into a genuine read on live content, all from data already recorded:

- **Right now:** arrivals to review, being prepared, live stories, visitors this week.
- **Activity chart:** stories published per day over the last 30 days (daily story counts), so you can see rhythm and gaps.
- **Where stories come from:** top sources by stories published in the last 7 days, as a compact ranked bar list — which sources are actually feeding the feed.
- **What readers liked:** top performing live stories by reader engagement over the period, with the story title linked into the Live column.
- **Reach:** visits this week, play-mode visits and shares, shown as three small numbers with a week-on-week direction.

Everything is read-only reporting. Nothing here changes scoring, gathering, publishing or the four-day window.

Editorial control keeps a one-line flow summary with a "Pipeline" link so it still orients you, but stops duplicating the full dashboard.

## Choices worth knowing

- Stories older than a few days still sort by their original publication date, as agreed — the charts count by publication day too, so an old story imported today doesn't distort today's bar.
- Popularity is based on swipes, shares and visits that are already collected; stories published before that tracking existed will show no figure rather than a zero.

## Technical notes

- New `src/components/topics/PipelineWorkspace.tsx` composing the existing `UnifiedContentPipeline` data hook into a two-column layout; `MultiTenantArticlesList` and the published list render inside columns instead of `TabsContent`. The hook, mutations, gathering, recovery and load-more behaviour are unchanged.
- New `src/components/topics/LiveInsightStrip.tsx` fed by existing RPCs: `get_daily_story_counts`, `get_topic_source_stats`, `get_topic_visitor_stats`, `get_topic_interaction_stats`, `get_popular_stories_by_period`. Parallel fetch, cached per topic, skeleton then content. Charts use the existing `recharts`/`src/components/ui/chart.tsx` setup.
- `src/pages/TopicDashboard.tsx` `TabsContent value="feed"` renders the strip then `PipelineWorkspace`, keeping `AddStoryDialog`, `GatheringProgressIndicator` and the collapsible Sources section. `?tab=feed` and all existing deep links keep working.
- `EditorialControlCenter.tsx` overview loses the four-metric `FlowMetric` grid in favour of a single sentence plus the existing Pipeline link; attention items, policy summary and control rows stay as they are.
- Compact card variants for the narrow Arrivals column added via props on the existing list components, not forks.
- No database migrations and no edge function changes.
