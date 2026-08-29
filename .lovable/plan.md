# Story Categories and Annual Insight Playback

Two connected features built on the Eastbourne archive (4,234 stories since Sep 2025, 7,169 articles with full body text retained).

## Part 1 — Discover the taxonomy

Rather than guessing categories, derive them from what has actually been published.

1. **Sample and cluster.** A one-off admin job sends story titles plus the first slide of every Eastbourne story (in batches) to the LLM and asks it to propose a category / sub-category tree, with counts and example stories. Output is reviewed by you before anything is fixed in stone.
2. **Freeze a seed taxonomy.** Expected shape: Crime (violent, theft, drugs, court, missing persons), Council & Politics, Planning & Development, Transport, Health, Education, Business, Environment & Coast, Culture & Events, Sport, Community, Weather & Incidents. Stored as data, not code, so it can be edited and extended per feed.
3. **Backfill classify.** Every existing story gets a primary category, optional sub-category, and confidence score. Cheap model, batched, resumable.
4. **Classify on ingest.** New stories are categorised during generation, so the label exists from day one.

## Part 2 — Per-category feed settings

Once stories carry categories, feed owners get a Categories tab in the topic dashboard:

- Toggle a category on/off for the feed.
- Set a **geographic radius per category** — the use case you described: missing persons pulled from a wide area, shoplifting only from the town itself.
- Set relevance threshold per category (how strictly local anchors must appear).
- Optionally set automation per category (auto-publish community events, hold court reporting for review).

The locality gatekeeper and relevance scoring already in the pipeline read these per-category overrides instead of one topic-wide setting, falling back to the topic default when a category has no override.

## Part 3 — Insight playback (six-monthly / annual review)

A shareable, scrollable "State of the Area" report for any date range:

- **Volume and mix** — how many stories, broken down by category, versus the previous period.
- **Movers** — categories that grew or shrank most (e.g. "planning stories up 60%").
- **Hot topics** — recurring named entities and keyword clusters (streets, buildings, people, organisations) ranked by story count and engagement.
- **Timeline** — the handful of multi-story running stories, shown as story arcs across the months.
- **Reader signal** — most-read, most-shared, most-swiped stories from the existing interaction tables.
- **Narrative summary** — an LLM-written editor's note over the computed numbers only (no free invention), so it reads like a review of the year.

Delivered as a page at `/feed/:slug/review/:period`, publicly shareable, with the same newsprint aesthetic as the feed, plus an image export for social.

## Other insight ideas worth considering

- **Coverage gaps** — categories that other local sources publish but this feed rarely does.
- **Source scorecard** — which sources actually drive each category, so owners can prune.
- **Seasonality** — predictable annual peaks (seafront events, storms, budget season) to pre-plan coverage.

## Technical notes

- New table `story_categories` (taxonomy, per-topic, seedable from a global default set) and `story_category_assignments` (story, category, confidence, model) — RLS scoped to topic ownership, service_role for the classifier.
- New table `topic_category_settings` for the per-category radius / threshold / automation overrides.
- Classification via an edge function `classify-stories` (batched, idempotent, resumable) called both as a backfill job and from the generation pipeline.
- Review data computed by an edge function `generate-period-review` and cached in a `topic_period_reviews` table so the public page is a single read.
- Multi-tenant throughout — no Eastbourne-specific logic; Eastbourne is just the first feed with enough history to be interesting.

## Suggested order

1. Taxonomy discovery run on Eastbourne, you review the proposed tree.
2. Backfill classification + admin view of the result.
3. Insight playback page (uses categories immediately, high visible payoff).
4. Per-category feed settings wired into the pipeline.
