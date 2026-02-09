

## Speed up "More like this" filtering

### Problem
When a user taps "More like this", the client-side filter applies instantly but a server-side RPC call (`loadStories`) fires to fetch the full filtered dataset. This round-trip causes a visible "Updating..." delay of 1-3 seconds.

### Solution: Prefetch on swipe
Since we already know the story content when the user swipes, we can **pre-compute the filter matches and prefetch server results in the background** before the user ever taps the button. By the time they tap, the data is already cached and ready.

### How it works

```text
User swipes slide 1
        |
        v
[2s delay] "More like this" button fades in
        |  (simultaneously)
        v
[Background] Pre-compute keyword matches for this story
[Background] Prefetch server-filtered results for those matches
        |
        v
User taps "More like this"
        |
        v
Results already available --> instant filter apply (no "Updating..." spinner)
```

### Technical details

**1. Add prefetch logic to `StoryCarousel.tsx`**
- When `showMoreLikeThis` triggers (after 2s delay on swipe), also call a new `onPrefetchFilter(story)` callback
- This runs the same keyword-matching logic from `handleMoreLikeThis` but only triggers the prefetch, not the UI filter

**2. Add prefetch infrastructure to `useHybridTopicFeedWithKeywords.tsx`**
- New function: `prefetchForKeywords(keywords, sources)` -- calls `loadStories` in the background and caches the result in a ref (`prefetchedFilterRef`)
- New function: `applyPrefetchedFilter(keywords, sources)` -- checks if prefetched data matches the requested filter; if so, applies it instantly instead of calling `triggerServerFiltering`

**3. Update `handleMoreLikeThis` in `TopicFeed.tsx`**
- Before calling `triggerServerFiltering`, check if prefetched results are available for the matching keywords
- If yes: apply instantly (no server call, no "Updating..." state)
- If no (e.g., user tapped before prefetch finished): fall back to current behavior

**4. Cache invalidation**
- Prefetch cache is keyed by the sorted keyword set
- Cache is cleared when the user navigates to a new story card (new prefetch starts)
- Only one prefetch in flight at a time (abort previous if story changes)

### What the user experiences
- Swipe a slide, wait 2 seconds, "More like this" fades in (same as now)
- Tap it: filter applies **instantly** -- no "Updating..." pill, no delay
- If they tap very fast before prefetch completes, they see the current behavior as a graceful fallback

### Files to modify
- `src/components/StoryCarousel.tsx` -- trigger prefetch callback alongside the button reveal
- `src/hooks/useHybridTopicFeedWithKeywords.tsx` -- add `prefetchForKeywords` and `applyPrefetchedFilter` functions
- `src/pages/TopicFeed.tsx` -- wire up prefetch on swipe, use cached results in `handleMoreLikeThis`

