# A live newsroom: insight on top, Arrivals beside Live

Today the Pipeline page hides Arrivals and Stories behind two tabs, so you only ever see half your newsroom, and the "at a glance" summary lives on another page inside Editorial control. This plan makes Pipeline the place you keep open all day: a beautiful, live-updating read on your feed above two working columns.

## The page

```text
+-----------------------------------------------------------------------+
|  LIVE NOW    12 reading today · 3 in the last hour        ● live       |
|  418 live stories   ·   630 gathered (30d)   ·   66% published         |
|  [ ribbon chart: gathered vs published, last 30 days ]                 |
+-----------------------------------------------------------------------+
|  What your feed is about        |  What readers reached for           |
|  category mix + rising places   |  top stories, shares, swipes        |
+-----------------------------------------------------------------------+
|  ARRIVALS (1/3)                 |  LIVE (2/3)                         |
|  newest first, compact          |  published stories, popularity      |
|  approve / discard              |  source + reach on each card        |
+-----------------------------------------------------------------------+
|  Sources (collapsed, unchanged)                                        |
+-----------------------------------------------------------------------+
```

- **Arrivals and Live side by side.** The two tabs become two columns — one third Arrivals, two thirds Live. You see what's waiting and exactly what it will sit next to.
- **Approve moves before your eyes.** An approved arrival lifts out of the left column and settles into the top of the right one as a "being prepared" card, then resolves into the finished story when generation completes. That single motion makes the whole pipeline legible.
- **"Stories" becomes "Live."** Arrivals / Live is the vocabulary across the page; unpublished states carry a small label inside the Live column.
- **Mobile.** Columns stack: insight strip, a compact Arrivals bar with count, then Live, with a simple switch between the two lists.

## Making it feel live

- **Real-time by subscription, not polling.** New arrivals, newly published stories and queue progress arrive over the existing live connection on articles, stories and the generation queue. A card slides in with a soft highlight that fades; the counter above rolls to its new value rather than jumping.
- **Reading right now.** A discreet "● live" dot with people reading today and in the last hour, refreshed on a light interval. Honest about small numbers: when nobody is reading it reads "quiet right now" instead of a lonely zero.
- **Numbers that animate.** Every headline figure counts up on first paint and tweens on change; the ribbon chart draws left to right once. All motion is short, eased, and fully disabled under reduced-motion.
- **Nothing flickers.** Values update in place with no layout shift and no spinners after the first load.

## Getting far more out of the stories we already hold

Beyond counts, the feed's own content becomes the insight — all from data already stored:

- **What your feed is about.** A clean share-of-coverage bar built from the story categories already assigned (4,533 of them for Eastbourne), so you can see at a glance that you're heavy on council and light on sport this month, with last month shown as a faint ghost for comparison.
- **Rising places and subjects.** The places and terms matched on incoming stories, ranked by how much they've grown in the last 7 days against the 30-day baseline — the early signal that something is building in your patch.
- **Where the feed comes from.** Top sources by stories published in the last 7 days, as a compact ranked bar, with anything that has gone quiet flagged.
- **How selective you are.** Gathered versus published over 30 days as one ribbon chart plus a single publish rate, so you can feel whether your news values are too tight or too loose.
- **What readers reached for.** Best-performing live stories by swipes, shares and visits, each linking straight to the story in the Live column.
- **Coverage gaps.** A quiet line naming categories with no live story in the last two weeks — insight that prompts action rather than just describing the past.

Reader metrics are young on this feed (single-digit visits last week), so every reader panel degrades gracefully: where there isn't enough data yet it says so plainly and shows the content-side insight instead of empty charts. Content insight is strong from day one.

## Craft standards

- Restrained: ink, one accent, generous white space, serif display numerals, hairline rules — no coloured card grid, no chart junk, no gridlines or legends where a label will do.
- Every figure is human-readable and comparative ("up on last week"), never a bare number.
- Skeletons match final layout exactly; each panel loads independently so one slow query never blocks the page.
- Keyboard reachable, screen-reader labelled, WCAG AA contrast, live regions announce politely, reduced-motion honoured throughout.

Nothing here changes scoring, gathering, publishing or the four-day window.

## Technical notes

- `src/components/topics/PipelineWorkspace.tsx` — two-column composition over the existing `useMultiTenantTopicPipeline` hook; `MultiTenantArticlesList` and `PublishedStoriesList` render in columns via a new compact variant prop rather than forks. Mutations, gathering, recovery and load-more unchanged.
- `src/components/topics/insight/` — `LiveNowBar`, `FlowRibbon`, `CoverageMix`, `RisingTerms`, `SourceMix`, `ReaderHighlights`, each self-fetching with independent skeletons; `AnimatedNumber` and `useReducedMotion` shared.
- Existing RPCs: `get_daily_story_counts`, `get_topic_source_stats`, `get_topic_visitor_stats`, `get_topic_interaction_stats`, `get_popular_stories_by_period`. New read-only RPCs needed for coverage mix (`story_category_assignments` grouped by category and month), rising terms (`topic_articles.keyword_matches` 7d vs 30d), and a live-now count over `feed_visits` — all `SECURITY DEFINER`, topic-owner/admin scoped, with grants.
- Realtime: one channel per topic subscribing to `articles`, `stories`, `topic_articles` and `content_generation_queue` (already in the publication), created in `useEffect` with `removeChannel` cleanup. Live-now count refreshes on a 60s interval, paused when the tab is hidden.
- Charts use the existing `recharts` + `src/components/ui/chart.tsx` wrapper; motion via CSS transitions and the existing Tailwind keyframes.
- `TopicDashboard.tsx` `TabsContent value="feed"` renders the insight strip then `PipelineWorkspace`, keeping `AddStoryDialog`, `GatheringProgressIndicator` and collapsible Sources. `?tab=feed` and all deep links unchanged.
- `EditorialControlCenter.tsx` drops its four-metric strip for a one-line summary plus the existing Pipeline link.
- Counts respect the agreed display-date rule, so an old story imported today doesn't distort today's bar.
