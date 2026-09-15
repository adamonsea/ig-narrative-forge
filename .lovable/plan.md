# Testing GPT Image 2 before we switch

## Why now

Our current model, GPT Image 1.5, is deprecated and OpenAI removes it from the API on 1 December 2026 [3](https://www.modellix.ai/blog/gpt-image-1-5-pricing/) — illustration simply stops working after that date. GPT Image 2 is the same family, one generation newer, keeps the same landscape 1536x1024 size, and costs less at every tier:

| Tier | Now (Image 1.5) | GPT Image 2 | Saving |
| --- | --- | --- | --- |
| Quick | $0.013 | ~$0.006 | ~55% |
| Creative | $0.05 | $0.041 | ~18% |
| Premium | $0.20 | $0.165 | ~18% |

On August's volume that is about **$11 instead of $24.52**, before the batch route. We are not on it already simply because nothing has changed the model since it was set up — no technical obstacle.

Two sibling models are worth seeing at the same time: GPT Image 2.5 Flare (faster) and 2.5 Sunburst (quality-first), same token price, five quality levels instead of three.

## The test

A comparison bench in the admin area, built for judging pictures rather than reading numbers.

**What it does**
1. You pick real stories from any feed — suggested default is 10 recent Eastbourne stories spanning a council piece, a crime piece, a community piece, a sport piece and a business piece, since those are where the style either works or falls apart.
2. For each story it builds the exact prompt the live pipeline would build — same tone analysis, same location extraction, same style guardrails — so we are comparing models, not prompts.
3. It generates that story across a grid you choose: models (Image 1.5, Image 2, 2.5 Flare, 2.5 Sunburst) by quality tier (Quick, Creative, Premium; the five-step scale for the 2.5 models).
4. Results appear as a side-by-side row per story, each image labelled with model, tier, actual cost and generation time, at the size they appear in the feed and full size on click.
5. You mark each image good, acceptable or reject. Those marks are saved, so the decision is based on a tally rather than a memory.

**What it costs to run**
A 10-story grid across 4 models at 3 tiers is 120 images — roughly $9 at today's prices, less on the new models. One run, and it settles the question.

**Prompt tuning pass**
Newer models follow instructions more literally, which usually helps but can push the illustration style toward realism. The bench lets you edit the style guardrails and re-run a single story cheaply, so the prompt is tuned before anything goes live, not after.

## Decision and switch

- Choose per tier, not globally: if Sunburst is clearly better for Premium and Image 2 is fine for Quick, we map them that way.
- Switch the live pipeline to the chosen models, leaving Image 1.5 selectable until 1 December as a safety net.
- Update recorded cost per tier so spend reporting stays accurate, and watch the first week of automated output.
- Keep the cheap wins already built: batch route for automated images on unpublished stories, and the regeneration cap.

Timeline: bench this week, run and judge within a few days, switch in early October — two clear months before the shutdown.

## Technical notes

- New admin page (product-owner only) plus an edge function `image-model-bench`, reusing `story-illustrator`'s prompt builders (`analyzeStoryTone`, `extractLocationDetails`, `extractSubjectMatter`, `buildIllustrativePrompt`, `buildPhotographicPrompt`) so the prompt is identical to production. Extract those into `_shared/` rather than copying them.
- Bench generations write to `image_generation_tests` (already exists) with model, tier, size, cost, duration, prompt and image URL, plus a verdict column for good/acceptable/reject. Images go to the existing `visuals` bucket under a `bench/` prefix so they can be cleared in one go.
- Bench never touches `stories` rows — no `cover_illustration_url` writes, nothing published.
- Runs sequentially with a small delay and a hard cap per run to avoid rate limits and runaway spend; the run is bounded by the grid you select and shows the estimated cost before it starts.
- `story-illustrator` gains `modelConfigs` entries for `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` with correct costs; GPT Image 2 bills by token, so read the reported usage into `cost_usd` and keep the per-tier figure only as a fallback.
- Existing OpenAI key covers all of these; no billing or infrastructure change.
