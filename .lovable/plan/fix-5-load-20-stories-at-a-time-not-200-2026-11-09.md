# Fix 5: load 20 stories at a time, not 200

## 1. What limit and offset mean (checked in the database)

Both functions count **stories, not rows**. Each picks a page of distinct story IDs (`LIMIT p_limit OFFSET p_offset`), then joins every slide for those stories.

| | Order | Page N offset today | Correct |
|---|---|---|---|
| `get_topic_stories_with_keywords` (main path, filters, prefetch) | `s.created_at DESC` | `N × 200` (filtered: `N × 400`), limit 200/400 | limit 20, offset `N × 20` |
| `get_public_topic_feed` (fallback) | display date DESC (the "old stories slot back to their date" rule) | `N × 20`, limit 20 | already correct |

**A second issue this exposes:** the two functions sort differently, and the app re-sorts by display date. At 20 per page, a story fetched on page 2 could slot in *above* stories already on screen (2 of Eastbourne's first 80 stories would do this today). Neither sort has a tie-breaker either. Fix: make the main function sort by the same display date as the fallback, with `story id` as the tie-breaker, and add the same tie-breaker to the fallback. Each function's inputs, outputs and filters stay exactly the same.

**Stories published or removed while someone scrolls** shift the offset by one. That's a possible repeat (already removed, since the app de-duplicates by story id) or a gap of one story. Fix: request each next page from 2 stories before the number already loaded from the server, and de-duplicate by id. That covers up to 2 removals mid-scroll with no gap.

## 2. What depends on how much is loaded

- **Feed cache** (`feedCache.ts`): already stores only the first 20 stories (`MAX_STORIES_PER_TOPIC = 20`) for 15 minutes fresh / 24 hours stale. Returning visitors still see the instant view, and it now matches page 0 exactly.
- **Realtime** (insert/update/remove via `upsertPublicStoryInFeed` / `removeStoryFromVisibleFeed`): works on whatever is loaded, finding each story by id. No change. Edits to a story not yet loaded are ignored until its page loads, as they are today beyond 200.
- **hasMore / infinite scroll:** `hasMore = page returned ≥ 20 stories` (main) or `= 20` (fallback). The scroll trigger is the last story card (`lastStoryElementRef`). That's correct at 20. EndOfFeedCTA shows when `hasMore` is false.
- **Story ghosting** (stories whose slides are placeholders are hidden): works per story, not by count. If a page has hidden stories, fewer than 20 show but `hasMore` still uses the server count, so scrolling continues.
- **Incomplete-slides re-fetch:** per story, in chunks. With 20 stories it does 10× less work.
- **Popularity / metadata enrichment:** popularity is a per-topic call (not paged). Parliamentary metadata takes the loaded story IDs, so 20 per call.
- **Filters:** server filter, filtered cold start and the "More like this" prefetch all use the main function and `rawLimit`, so all move to 20 + offset `N × 20`. The client-side fallback filters only what's loaded (fewer stories on page 0; it's only used when the server call fails). The **filter index** (`loadFilterStoryIndex`, 400-story batches) is a separate loop and doesn't change.
- **Cards placed by index** (PWA card after card 4, community pulse, sentiment, quiz, insight, parliamentary): placed by position among stories. With in-order paging they stay put and keep appearing as pages arrive.
- **Card positions for Phase 1:** `storyIndex − 1` across everything loaded, so page 1's first card is position 20. That stays true as long as no story is inserted above loaded ones, which the matching sort fixes.
- **Other users of these functions:** ExplorePile (150 stories, offset 0: picks the newest 150 by display date instead of created date, a negligible difference), `detect-orphaned-stories` (1000, order irrelevant) and the waitlist email (fallback function: order unchanged, tie-breaker only). Story pages, roundups and the widget use neither function nor this hook.

## Changes

1. `useHybridTopicFeedWithKeywords.tsx`: `rawLimit` → `STORIES_PER_PAGE` in `loadStories` and `prefetchForFilter`. Offset = stories already loaded from the server minus 2 (0 for page 0), on both main and fallback paths.
2. One database change: `get_topic_stories_with_keywords` sorts by display date, then id. `get_public_topic_feed` adds the id tie-breaker. Nothing else in either function changes.
3. AGENTS.md rule: the feed pages 20 stories at a time, and both functions sort by display date + id.

## Checks (none published)

- **Page join (database):** for Eastbourne, compare the IDs from pages 0–3 (20 each, using the overlap rule) with one 80-story request: same order, no gaps, no repeats. Repeat with a keyword filter and with a source filter, and on the fallback function.
- **Same in the browser:** open the feed, scroll until 4 pages have loaded, read the order of the story cards and compare it with the database result. Repeat with a filter on. Check the console for errors.
- **Payload size:** measure the first-load response before (200 stories, ~1.9MB) and after (expected ~20 stories, ~200KB), and the number of cards rendered (167 now, ~20 after).
- **Returning visitor:** reload the page and confirm the cached view appears instantly, then refreshes.
- **Positions:** confirm the first card loaded on page 1 sends position 20.
- **Other users:** ExplorePile still loads its stack; run the existing tests.

**What could break:** scrolling stopping early (a `hasMore` mistake), repeated or missing stories (offset), cards jumping (sort). The page-join checks above are aimed at exactly these.
