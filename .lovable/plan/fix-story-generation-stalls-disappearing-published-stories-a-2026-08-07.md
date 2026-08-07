# Fix story generation stalls, disappearing published stories, and unverified approvals

## 1. Stop DeepSeek truncation stalls (generator)
`enhanced-content-generator` runs slide generation with a 3,200 token budget. Flash spends much of that on internal reasoning for tabloid content, hits `finish_reason=length`, and the job escalates to Pro — roughly doubling job time and leaving items churning in the queue.

- Raise the slide-generation token budget (3,200 -> 6,000) so Flash finishes in one pass.
- Add retry-with-backoff for 5xx/520 responses from the image call in `story-illustrator` (a Cloudflare 520 is currently a hard failure).

## 2. Stop published stories vanishing and reappearing
Two separate causes in `useMultiTenantTopicPipeline.tsx`:

- On any RPC error the hook blanks the whole story list (`setStories([])`), so a single transient failure empties the Published tab until the next successful poll. Keep the previous list on error and surface a quiet retry instead.
- The story fetch uses one global 200-row limit across all statuses, newest first. In a large topic (Eastbourne has thousands of published stories) new drafts push published items out of that window, so they drop off the tab. Fetch per status with its own page size (~50) and paginate.

## 3. New feed approvals: diagnose before fixing (unconfirmed)
Verified so far: the Rock music topic is owned by your account, RLS on `stories` allows the owner to update, drip feed is off, the triggers on `stories` are harmless, and `get_admin_topic_stories` returns both draft and published rows correctly. All 11 Rock music stories are still `status='draft'`, so nothing has actually flipped to published in the database.

What that leaves — and what the plan verifies first, rather than assuming:

- The approve handler in `UnifiedContentPipeline.tsx` calls the hook and then relies on it to refresh; if the update silently affects zero rows (a possibility PostgREST reports as success) the UI would look unchanged with no error.
- Add explicit verification to the approve path: request the updated row back from the update call, treat "no row returned" as a hard error with a visible toast, and log the story id and outcome.
- Re-run one approval on a Rock music story after that change and read the result from the database before declaring it fixed. If the update does return the published row, the fault is display-only and section 2 covers it.

## Technical notes
- Files: `supabase/functions/enhanced-content-generator/index.ts`, `supabase/functions/story-illustrator/index.ts`, `src/hooks/useMultiTenantTopicPipeline.tsx`, `src/hooks/useMultiTenantActions.tsx`, `src/components/UnifiedContentPipeline.tsx`.
- No schema changes required.
