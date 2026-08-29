# Period Review: better insights, told as a scrollable story

The current review page is a stack of grey bars: correct data, no drama. Two changes — richer metrics, and a chaptered, animated presentation.

## Part 1 — Insights worth reading

Kept and improved:
- Volume vs previous period, per-category mix with movers.

New, computed in `generate-period-review`:

- **Scale of the archive** — stories published, total words written across slides, average read length, number of distinct sources drawn on, busiest single day. "We published 1,214 stories and 486,000 words about Eastbourne."
- **Crime breakdown** — sub-category split within Crime (violence, theft, drugs, court, missing persons, antisocial behaviour) with period-on-period change. The single most interesting cut for a town.
- **Council & politics breakdown** — planning decisions, budget, licensing, elections, plus the named councillors and wards that recur most.
- **Anomalies** — categories or terms whose share in one month is far above their 12-month baseline (simple z-score over monthly counts). Rendered as "Spikes": "Flooding appeared in 19 stories in November, 8x its normal month."
- **Rising and fading terms** — terms that entered the vocabulary this period versus terms that dropped out, each pinned to the month they peaked.
- **Streets and places** — place-like terms (roads, buildings, wards) ranked, giving a map-less geography of coverage.
- **People and organisations** — recurring named entities, with the category they mostly appear under.
- **Running stories** — clusters of 3+ stories sharing terms across weeks, shown as arcs with first/last dates.
- **Reader signal** — most-read, most-shared, plus best-performing category (reads per story, not raw reads).
- **Source scorecard** — which sources fed which categories.

The editor's note stays LLM-written over these numbers only, but gets a punchier brief: one opening line that could be a headline, then three short paragraphs.

## Part 2 — Make it feel like a piece of design

Rebuild `/feed/:slug/review/:period` as a full-bleed, chaptered scroll experience in the newsprint aesthetic, not a report.

Chapters, each a full viewport section:

1. **Cover** — huge masthead type, the period, one line of the editor's note, animated word-count counter ticking up.
2. **The year in numbers** — three or four oversized figures that count up as they enter view.
3. **What we covered** — animated stacked/segmented bar that draws in on scroll, categories labelled inline; tap a segment to expand its sub-categories.
4. **Crime, closer up** — the crime sub-category split as an animated radial/segmented chart with change arrows.
5. **The council beat** — planning/budget/licensing counts plus recurring names.
6. **Month by month** — the timeline as a proper area chart that draws left to right, with spike months called out by an annotated marker.
7. **Spikes and surprises** — anomaly cards that flip in one at a time, each stating the term, the month, and the multiple.
8. **The words of the year** — term cloud that scales and staggers in, rising terms in accent colour, fading terms muted.
9. **What readers cared about** — the top stories as real story cards, not list rows.
10. **Editor's note** — set as pull-quote typography, closing the piece.

Motion rules: `framer-motion` `whileInView` with staggered children, existing `MaskRevealHeading` for section titles, count-up hooks for figures, chart paths animated via `pathLength`. Everything respects `useReducedMotion` (already in the project) — reduced motion renders the same layout, statically. Sections are lazy so the page stays fast.

Also: a share card export for the cover chapter, matching the existing OG image pipeline.

## Technical notes

- Extend the `data` JSON written by `supabase/functions/generate-period-review/index.ts` with the new blocks (`scale`, `crimeBreakdown`, `councilBreakdown`, `anomalies`, `risingTerms`, `places`, `entities`, `runningStories`, `sourceScorecard`). Existing keys keep their shape so nothing breaks; the page renders whichever blocks are present.
- Word counts come from joining `slides` for the period's stories; sources from `stories`/`topic_articles` → `content_sources`.
- Anomaly detection is arithmetic in the edge function (monthly counts, mean, standard deviation, flag ≥2σ and ≥3 occurrences) — no extra AI cost.
- Frontend: split `src/pages/PeriodReview.tsx` into `src/components/review/` chapter components plus a shared `useCountUp` hook and animated chart primitives; keep colours on existing semantic tokens.
- Multi-tenant throughout: no topic-specific logic, every chapter hides itself when its data is empty.

## Order

1. Extend the review generator with the new metrics and regenerate Eastbourne.
2. Rebuild the page chapter by chapter (cover, numbers, categories first — those carry most of the payoff).
3. Crime/council deep-dives, spikes, words.
4. Share card export.
