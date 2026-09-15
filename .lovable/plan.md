# Steady up the Published queue

The Published tab is fed by several overlapping queries that can each fail or truncate on their own. When one of them is slow, the tab keeps rendering — just with fewer stories, missing slides, or a red error toast. That is why it feels different every time you look at it. This is a reliability clean-up, not new functionality.

## What's actually happening

**1. Two different lists of stories are stitched together.**
Stories are fetched twice: once through the admin function (capped at 50 per status) and once directly (capped at 200, newest-updated first). The two results are merged and de-duplicated. As stories are edited, the 200-row window shifts, so the number shown in Published moves up and down even though nothing was published or removed.

**2. Slides are fetched separately and silently dropped on failure.**
The story rows say how many slides exist, but the slide text is loaded by a second round of queries. If those time out (which has been happening on Eastbourne), the code logs the error and carries on, so stories render as if they have no slides. The direct story query already returns the slide text inline, but the merge throws that copy away in favour of the row without slides.

**3. Parliamentary filtering can delete stories from the view.**
A follow-up query decides which parliamentary stories to keep. It has no error handling: if it fails, every parliamentary story is dropped from the tab. A different failure in the related query makes the same stories all reappear as ordinary stories.

**4. Refresh churn and toast noise.**
The tab reloads everything every 30 seconds, plus on every live database change (300ms debounce), plus after every action. Each full reload can raise its own error toast, and there are 61 separate toast messages across the pipeline screens — so one slow moment produces a stack of red boxes.

## The fix

**One source of truth for the list.** Use a single consistent query path for Published, with one clear page size, so the count only changes when stories actually change. Keep the second query purely as a fallback if the first one fails, never as an additive merge.

**Never show a story with its slides missing.** Prefer the slide text that already comes back with the story. Where slides do have to be fetched separately, a failure is treated as "not loaded yet" — the story keeps its previous slide content and shows a small retry, instead of silently rendering as empty.

**Fail-safe parliamentary filtering.** If the filter query fails, keep the stories visible (current behaviour is to hide them). Errors here should never remove content from the tab.

**Calmer refreshing and toasts.** Stop the fixed 30-second full reload while the live subscription is connected, and skip a refresh entirely when the tab isn't visible. Collapse repeated load failures into a single quiet inline warning with a retry, instead of one toast per attempt. Keep success toasts only for actions you took deliberately (publish, delete, approve); drop the incidental ones.

**A consistency check.** After the changes, load the Eastbourne Published tab repeatedly and confirm the story count is stable, every story shows the slide count it claims, and no toast appears unless an action genuinely failed.

## Making the page feel fast

**Small images instead of full-size ones.** Every story card currently loads the full-resolution cover illustration — often over a megabyte each — even though it's displayed as a thumbnail. There is already a helper for requesting resized images; the Published list doesn't use it. Cards will request a thumbnail-sized version, and the full image only when a story is expanded.

**Load images only when scrolled into view.** None of the story images defer loading today, so a page of ten stories downloads ten large images at once. Adding lazy loading and fixed image dimensions stops the layout jumping and cuts the initial load.

**Fetch less per refresh.** The list only needs the slide text of the stories currently on screen, not all of them. Slides for collapsed stories load on demand, which removes the heaviest query from every refresh.


## Technical notes

- `src/hooks/useMultiTenantTopicPipeline.tsx`: consolidate the `get_admin_topic_stories` per-status fetch (lines ~467-497) and the direct `stories` query (lines ~502-535) into primary + fallback rather than concat/dedupe; carry the inline `slides(...)` selection through the merge; make the slides pass (lines ~614-657) preserve prior slides on error and expose a `slidesError` flag; add error handling to the parliamentary mentions query (line ~683) so a failure keeps stories visible; gate the 30s poll (lines ~1369-1379) on subscription status and `document.visibilityState`; replace per-load destructive toasts (lines ~217, ~795) with a single deduplicated inline error state.
- `src/components/UnifiedContentPipeline.tsx` / `PublishedStoriesList.tsx`: surface the inline "couldn't load — retry" state and the per-story "slides not loaded" state instead of rendering empty; audit toast call sites and remove incidental ones.
- `PublishedStoriesList.tsx` images (lines ~626-628, ~738-743): route `cover_illustration_url` through `optimizeImageUrl` from `src/lib/imageOptimization.ts` (thumbnail width for the card, full size only in the expanded/preview view), add `loading="lazy"`, `decoding="async"` and explicit width/height.
- Slides on demand: fetch slide rows for expanded stories only (via the owner-scoped `get_admin_slides_for_stories` function), keeping `slide_count` from the story row for the collapsed badge.
- No schema changes. The owner-scoped slides function added earlier stays as the fast path.
