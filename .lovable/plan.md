# Two separate faults: a slow generator and a disappearing Published tab

Neither is caused by the onboarding / intro-flow changes. They are unrelated, and both are confirmed from logs and data.

## 1. The story generator is not stuck — it is doing every job twice

Edge function logs show the same pattern on every tabloid job:

```text
[slide-generation] finish_reason=length chars=11952 completion_tokens=3200
deepseek-v4-flash returned no usable slide JSON - escalating
[slide-generation-pro] finish_reason=stop chars=2168 completion_tokens=3179
```

`deepseek-v4-flash` is spending the entire 3,200-token budget thinking out loud and gets cut off before it emits valid JSON. So every story burns one wasted flash call (~25s) and then a second pro call that succeeds. Throughput is roughly halved, which is why the queue reads as stuck: 17 pending, 7 processing, oldest since 09:23.

There is also a genuine upstream failure in the same window: `api.openai.com` returned **520 (Cloudflare)** for image generation. That is an OpenAI outage, transient, nothing to fix in our code beyond retrying.

**Fix**
- Raise the slide-generation token budget so flash has room for its reasoning plus the JSON (6 slides: 3,200 -> 6,000; scale the 8/12-slide tiers to match).
- If flash still returns `finish_reason=length` with no usable JSON on the next runs, demote it for slide generation and make `deepseek-v4-pro` the primary for this one call path, keeping flash for the shorter post-copy and caption calls where it is not truncating.
- Add a short retry with backoff on OpenAI 5xx (520/502/503) in the illustration call so a Cloudflare blip does not fail the story's artwork outright.

## 2. Published stories vanishing and reappearing

Two real bugs in the pipeline data hook.

**a. A single failed query blanks the whole tab.** When the admin stories RPC errors (which it does under load, alongside the timeouts we have been seeing), the hook calls `setStories([])` and returns. The Published tab instantly empties, then refills on the next poll. That is exactly the flicker being seen.

**b. The Published tab only ever sees a 200-row window.** The hook asks for all statuses with a limit of 200. Eastbourne has **3,955 published stories** plus drafts and ready items. Which 200 come back shifts as new rows are created, so published stories drop out of the list and come back later with no user action.

**Fix**
- On query error, keep the previously loaded stories and surface a non-destructive "couldn't refresh" state instead of wiping to an empty array.
- Stop pulling all statuses into one 200-row bucket. Query the Published tab by status with its own pagination (newest first, page size ~50, load-more), so the tab shows a stable ordered list rather than a moving window.
- Keep the existing drip-queued merge, but page it alongside the published query rather than on top of a truncated set.

## Technical notes

- `supabase/functions/enhanced-content-generator/index.ts` line 514: `maxTokens` tiers; lines 640-660: the flash -> pro -> gpt-4o-mini escalation ladder.
- `supabase/functions/story-illustrator/index.ts`: add 5xx retry around the OpenAI image call.
- `src/hooks/useMultiTenantTopicPipeline.tsx` lines 429-446: the `p_limit: 200` RPC and the `setStories([])` error path; lines 451-485: the drip-queued query.
- No schema changes required. `get_admin_topic_stories` already accepts `p_status` and `p_offset`.

## Out of scope

Nothing in the onboarding wizard, feed setup guide, or explainer work is touched.
