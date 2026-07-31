# Image generation: measure, then cut cost and latency

The OpenAI announcement changes nothing for us — it only repriced text models (Luna/Terra/Sol). Our image spend and speed are governed by our own settings, so this plan measures them first, then makes two low-risk changes.

## Phase 1 — Audit (no behaviour change)

Add lightweight timing and cost fields to each illustration run so we can see real numbers instead of guessing:

- Record per generation: model tier used, image size, wall-clock duration, output bytes, whether it was auto or manual, and how many pre-processing LLM calls ran before it.
- Surface a simple table in the admin view: last 30 days grouped by tier, with count, average duration, and estimated spend.
- Report back with the actual split of low vs medium tier and the average seconds per image.

Nothing about generation changes in this phase.

## Phase 2 — Cost cuts (only where Phase 1 justifies them)

Verified current state:

- Automated illustration already forces the cheapest tier (`gpt-image-1.5-low`, 2 credits).
- Manual illustration defaults to `gpt-image-1.5-medium` (4 credits) — this is the default whenever a caller omits the model.
- Every OpenAI image call requests `1536x1024`.

Proposed changes, one at a time with a clear revert:

1. Flip the manual default from medium to low. Medium and high stay available as an explicit choice in the model selector, so nothing is removed — it just stops being the silent default.
2. Trial `1024x683` (same 3:2 ratio) for the low tier only. Cheaper and faster; feed cards and OG crops are both well under this. Keep 1536x1024 for medium/high where the image is the point.
3. Audit the pre-image `gpt-4o-mini` calls (landmark extraction, prompt enrichment). Where a story has no location detail to extract, skip the call rather than making it and discarding the result.

## Phase 3 — Speed

- Smaller size (Phase 2) is the real latency win — lower tiers at a smaller size render substantially faster.
- Perceived speed: switch manual illustration to a streaming request so partial frames render progressively behind a blur instead of a spinner. Same cost, feels much faster.

## Guardrails

- The anonymity guard, illustration style guardrails, and auto-tier forcing are untouched.
- Each Phase 2/3 item ships separately so any regression is a single revert.
- No change to how images are stored, compressed, or served.

## Technical notes

- Instrumentation lives in `supabase/functions/story-illustrator/index.ts` and `auto-illustrate-stories/index.ts`, written to a small metrics table read by the admin view.
- Tier defaults are the `modelConfigs` fallback in `story-illustrator`; size is the `size` field on the OpenAI call.
- Credit costs in `src/lib/creditService.ts` stay as they are — the saving comes from which tier gets used, not from repricing.
