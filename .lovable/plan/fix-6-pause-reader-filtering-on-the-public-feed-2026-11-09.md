# Fix 6: pause reader filtering on the public feed

One switch, `FEED_FILTERS_ENABLED = false`, in a new `src/lib/featureFlags.ts`. No filter code is deleted. Turning it back on means changing that one line.

## 1. What loads the filter index today
All of these are in `src/hooks/useHybridTopicFeedWithKeywords.tsx`. Every one calls `loadFilterStoryIndex` (line 1321), which pages through `get_topic_stories_with_keywords`:
- **On every visit, straight after the first page loads (line 2325).** This is the main cause.
- **When topic keywords arrive or change (effect at 2219–2232, call at 2230).** This runs on every visit too, so most visits load the index twice.
- **About 2 seconds after any filter change (line 2180).**
- **About 2 seconds after a realtime story insert or update (line 1903).** So live publishing triggers it again while a reader is on the page.
- **When the filter modal opens:** `TopicFeed.tsx` 205–211 calls `ensureFilterStoryIndexLoaded` (line 1546).
- **After a card's first swipe:** `prefetchForFilter` (line 1911) runs through `handlePrefetchFilter` (`TopicFeed.tsx` 270, `StoryCarousel.tsx` 146). This is a filtered `get_topic_stories_with_keywords` call, not the index itself.

## 2. Where a filter can be set, and what happens when the switch is off
- **Hamburger "Filter" item** (`FeedHamburgerMenu.tsx`): hidden. `TopicFeed` won't render `FilterModal`.
- **"More like this" on cards:** `TopicFeed` passes neither `onMoreLikeThis` nor `onPrefetchFilter`. The card already hides the button when there's no handler (`StoryCarousel.tsx` 716), so the swipe prefetch doesn't fire either.
- **Sticky "Clear filters" and the active-filter banner:** they only show when `hasActiveFilters` is true. With the switch off they're also gated directly, so they can't show.
- **URL query parameters and deep links (emails, widget):** the feed page never reads filter parameters. A link like `?keyword=x` is ignored and opens the plain feed. I'll check this in the browser.
- **Saved filters:** the `saved_filters` table is only used by `AdvancedSearch.tsx`, which isn't on the public feed. Nothing changes.
- **Roundups (daily/weekly lists):** they have their own local filter and don't use the index. Nothing changes.
- **Story pages and the widget:** they don't use this hook. Nothing changes.
- **Filters left from an earlier visit:** filter selections aren't saved between visits. As a safeguard, when the switch is off the hook treats selections as empty, so the plain feed always loads.

## 3. Other users of this code and data, all unaffected
- **Keyword, landmark, organisation and source data:** read-only for this change. No database or curator-screen changes.
- **Community Pulse, sentiment cards, categories, gathering, locality gate and negative keywords:** these read keyword data in their own components and backend functions. They don't use the index or this hook's filter state.
- **`filterMatchesMap` in `TopicFeed`:** it's only used to feed "More like this". It's left in place (it's a cheap in-memory step) and simply isn't used.
- **Main feed paging (fix 5):** it calls `loadStories(..., null, null)` exactly as now, so ordering and page joins don't change.
- **Phase 1 card positions, realtime updates, the feed cache and ghost filtering:** none of them depend on the index. The realtime handler keeps everything except its 2-second index reload.

## 4. Changes
- **`featureFlags.ts`:** add the switch.
- **The hook:** the four automatic `loadFilterStoryIndex` calls, `ensureFilterStoryIndexLoaded` and `prefetchForFilter` each return early when the switch is off. `filterOptionsReady` reports ready, so nothing waits on the index.
- **`TopicFeed.tsx`:** pass `showFilters={FEED_FILTERS_ENABLED}` to the hamburger menu. Gate the Clear button, the banner, `FilterModal` and the two card handlers.
- **`FeedHamburgerMenu.tsx`:** add a `showFilters` prop that hides the Filter item.

## 5. Risks and checks
- **Risk: the "Curate" loading state waits forever for the index.** Check: `filterOptionsReady` reports true and the feed renders.
- **Risk: a hidden effect still loads the index.** Check: open Eastbourne in Playwright, scroll three pages, swipe a card and wait 10 seconds. Then count network calls to `get_topic_stories_with_keywords`. Only paged calls with `p_limit` around 22 should appear, with no large index chunks. I'll also record total data used before and after (expect it to drop from about 22MB to under 1MB).
- **Feed loads and scrolls:** check 20, then 40, then 60 cards, in the same order as fix 5, with no console errors.
- **No filter UI:** check there's no Filter item in the hamburger menu, no "More like this" after a swipe and no Clear button.
- **Deep link:** `/feed/eastbourne?keyword=council&source=x` should show the normal feed.
- **Editorial control:** signed in as the owner, open the keywords screen, add a keyword and save, then remove it. Check the change reads back. If I can't sign in, I'll check through the database and tell you.
- **Tests:** run the existing tests. Test browser visits will be deleted afterwards, as before.

Nothing is published. The change is only in the app, with no database changes.
