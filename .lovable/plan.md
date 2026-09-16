# Old stories shouldn't jump to the top of the feed

## What's happening

Four Eastbourne stories published this morning were originally written on 14-17 July. The feed and the pipeline both order stories by the moment *we* created the story, not by when the story was originally published — so anything old that goes through the pipeline today lands above genuinely fresh news.

## The rule to apply

Every story gets a **display date**:

- If the original publication date is within the last 3 days, the story sits at the top as normal (using when we published it, so newly curated fresh news stays first).
- If the original publication date is older than 3 days, the story slots into the feed at its original date — so a July story appears among July stories, not above today's.
- If no original date is known, fall back to when we created the story (today's behaviour).

The same ordering applies in the pipeline lists, so what you see while reviewing matches what readers get.

## What changes

1. **Feed ordering (database)** — update the public feed function so stories are ordered by this display date instead of story creation date, and return the value so the app can use it.
2. **Feed ordering (app)** — the feed hook currently sorts on story creation date; switch it to the display date, including the "load more" merge and the filtered views.
3. **Pipeline ordering** — published and arrivals lists in the dashboard order by the same display date.
4. **Date shown on cards** — cards continue to show the original publication date, which will now match their position.

5. **Roadmap note** — add "Pin a story to the top of the feed" to `roadmap.md` as a future feature, so a late-but-great story can still be surfaced deliberately. Not built now.

## Out of scope

No change to scoring, the four-day news window, gathering, or what gets published — this is ordering only.

## Technical notes

- Display date expression: `CASE WHEN sac.published_at IS NULL THEN s.created_at WHEN sac.published_at > now() - interval '3 days' THEN s.created_at ELSE sac.published_at END`.
- Touch `get_public_topic_feed` (order in both the `story_ids` CTE and the outer select, add a `display_date` column), and mirror in `get_topic_stories` / `get_stories_unified` where the pipeline reads.
- In `useHybridTopicFeedWithKeywords.tsx`, `content_date` is set from `story.created_at` in two places (initial transform and the paged transform); derive it from the new display date and keep every existing `.sort()` on `content_date` unchanged.
- `useMultiTenantTopicPipeline.tsx` orders by `created_at` — apply the same derived ordering client-side after fetch.
