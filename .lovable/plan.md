## Diagnosis

The public feed is likely showing stale or mismatched state from three related paths:

1. **Cached feed content can remain visible while refresh is cycling.** The feed intentionally shows `localStorage` cache first, then refreshes in the background. On a home-screen/PWA install this can make deleted stories appear to remain if the fresh refresh fails, times out, or does not replace the cached list.
2. **Realtime currently flags new stories but does not actually patch the feed list.** For `stories` INSERT/UPDATE it only sets the “new stories” state; it does not remove unpublished/deleted stories, and it does not add the new published story into the visible list unless a full refresh succeeds.
3. **Some dashboard removal actions only change `status`, not `is_published`.** The feed RPCs require `status = 'published'`, so these should eventually disappear from the fresh feed, but stale cache/realtime behavior can keep old story cards visible on device. The safer invariant is: if a story is returned to review or archived, `is_published` must also become `false`.

I also checked Eastbourne: recent added stories are currently mostly `status = ready` and `is_published = false`, so they correctly do not appear in the public feed yet. There are thousands of older published Eastbourne stories; the primary feed RPC is returning a capped first page/offset window, so refresh correctness depends on fully replacing the client state.

## Plan

1. **Make public feed refresh authoritative**
   - On every successful fresh load for page 0, fully replace the visible feed state and overwrite the cache.
   - If a fresh load returns zero or fails after showing cache, keep the error/retry signal clear instead of presenting stale content as if it is fully current.
   - Add a small cache freshness guard so a PWA can show cached content instantly, but the “Live” state only reflects realtime connection, not data freshness.

2. **Patch realtime to reflect story lifecycle changes**
   - For story updates belonging to the current topic:
     - If a story becomes unpublished, archived, draft, or otherwise not public, remove it from `allStories`, `allContent`, `filteredContent`, and cached feed.
     - If a story becomes public, fetch its full public story/slides and insert or update it in-place.
   - Keep the previous slide-update loop fix: slide updates should only repair incomplete current stories, not full-refresh the feed.

3. **Fix dashboard/story removal invariants**
   - Update “Return to Review” and “Archive” paths so they always set `is_published: false` as well as the intended status.
   - Keep delete cascade behavior intact.
   - Avoid broad changes to story ranking, queue processing, or automation thresholds.

4. **Add a minimal feed cache invalidation helper**
   - Add a targeted function in `feedCache.ts` to remove/update individual cached stories for a slug.
   - Use it only when realtime confirms a story was unpublished/deleted or when fresh page-0 data is loaded.

5. **Verify with live behavior**
   - Use Playwright against `/feed/eastbourne` to confirm:
     - cached content is replaced after fresh load,
     - the feed reaches stable Live state,
     - no endless Updating loop,
     - visible story IDs match the public RPC result after refresh.
   - Query the database read-only before/after to confirm no unintended published stories are changed.

## What I will not change

- No changes to ranking/scoring/locality thresholds in this pass.
- No bulk data edits unless we find a specific corrupted row set.
- No loosening of RLS/security policies.