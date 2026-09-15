# Replacing the image model before 1 December — and what it does to costs

## The situation

We generate every illustration with GPT Image 1.5 at 1536x1024. That model is deprecated and OpenAI removes it from the API on 1 December 2026 [3](https://www.modellix.ai/blog/gpt-image-1-5-pricing/). After that date, illustration stops working entirely unless we have moved. We have about ten weeks.

The good news: the replacement is cheaper, keeps the same landscape size, and is a newer generation of the same family — so the house style should carry over rather than restart.

## The options

All four keep landscape 1536x1024, so nothing about card shapes or crops changes.

| Model | Quick | Creative | Premium | Notes |
| --- | --- | --- | --- | --- |
| GPT Image 1.5 (today) | $0.013 | $0.05 | $0.20 | Gone 1 December |
| **GPT Image 2** | ~$0.006 | $0.041 | $0.165 | Current flagship, same family, cheaper at every tier [3](https://costgoat.com/pricing/openai-images) |
| GPT Image 2.5 Flare | same token rate | | | Latency-first variant, five quality levels |
| GPT Image 2.5 Sunburst | same token rate | | | Quality-first variant, five quality levels |
| Gemini 3 Pro Image | roughly $0.13 per image | | | Different house style — a visual reset, not a swap |

GPT Image 2 is the obvious primary candidate: same lineage as what you already like, 20-55% cheaper per image depending on tier, and it still does the three quality steps we map Quick, Creative and Premium onto. The 2.5 variants are worth seeing side by side, because Sunburst is the quality-first option and may be the better home for Premium.

## What this does to the bill

August was $24.52 (1,383 Quick by hand, 478 Quick automated, 3 Creative).

The same month's work on GPT Image 2: **about $11**. Adding the batch route for automated images on stories not yet published takes it to **about $9**. No change in size, shape or how fast a published story gets its picture.

Batch (half price, up to 24 hours) works on GPT Image 2 as well, so the work already built keeps its value.

## Plan

1. **Side-by-side trial.** Take 10 recent Eastbourne stories and generate each one four ways: current model, GPT Image 2, 2.5 Flare, 2.5 Sunburst — at all three of our tiers. Put them in a single comparison page in the admin so you can judge Quick, Creative and Premium on your own stories rather than on samples.
2. **Pick per tier.** Nothing says all three tiers must use the same model. If Sunburst is visibly better for Premium and GPT Image 2 is fine for Quick, we map them that way.
3. **Switch, keeping a fallback.** Point the illustrator at the chosen models, keep GPT Image 1.5 selectable until 1 December as a safety net, and update the recorded cost per tier so your spend reporting stays accurate.
4. **Re-tune the prompt only if needed.** Newer models follow instructions more literally; if the illustration guardrails (flat shapes, no shading, no realism) drift, adjust the prompt during the trial rather than after go-live.
5. **Keep the cheap wins.** Route automated illustrations through batch for stories not yet published, tighten the regeneration cap from 3 to 2, and show the regeneration count on the card.

Do step 1 now, decide within a week, switch in early October. That leaves two clear months of margin before the shutdown.

## Technical notes

- Size is hardcoded `1536x1024` in four places in `story-illustrator`; the new models take the same value, so no size change.
- `modelConfigs` gains entries for `gpt-image-2`, `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` with corrected `cost` values; the tier names (Quick/Creative/Premium) and credit prices stay as they are unless you want to reprice.
- GPT Image 2 bills by token rather than a flat per-image fee, so record the reported usage into `image_generation_metrics.cost_usd` rather than a hardcoded constant, and keep the per-tier estimate only as a fallback.
- The 2.5 models expose five quality levels rather than three; the trial page should expose them so the mapping is chosen on evidence.
- Trial page is admin-only, writes to a scratch table or reuses `image_generation_tests`, and does not touch published stories.
- The existing OpenAI key keeps working for all of these; no billing change needed.
- `illustration-batch-poller` and the batch route already built work unchanged with the new models.
