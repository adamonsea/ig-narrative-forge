# Image costs: what you pay, what you paid, and how to pay less

## Price per image today

We generate every illustration at 1536x1024 (landscape). OpenAI only offers three sizes on this model — square 1024x1024, portrait 1024x1536, landscape 1536x1024 — and charges more for the two non-square ones [1](https://developers.openai.com/api/docs/models/gpt-image-1.5):

| Tier | Landscape 1536x1024 (what we use) | Square 1024x1024 | Landscape via batch |
| --- | --- | --- | --- |
| Quick | $0.013 | $0.009 | $0.0065 |
| Creative | $0.05 | $0.034 | $0.025 |
| Premium | $0.20 | $0.133 | $0.10 |

There is no cheaper small landscape option — asking for a smaller landscape is not possible, the ladder above is the whole menu. Batch is exactly half price but takes up to 24 hours.

## What you actually spent

August (last full month): **$24.52**
- 1,383 Quick images you triggered by hand: $18.15
- 478 Quick images from automation: $6.23
- 3 Creative: $0.15

Last 30 days: **$16.64**. September so far: **$4.11**.

## What the regime just built saves: very little

Checking the last 60 days of generations against the stories themselves:
- Every automated illustration was made within 24 hours of the story arriving, and the batch route only applies to stories older than 24 hours. On current behaviour it almost never fires.
- The cap of 3 regenerations would have blocked 13 generations out of 2,154.

Projected spend as currently built: **roughly $23-24 a month** — essentially unchanged. The real cost is that 915 of 2,154 generations (42%) were repeat images on a story that already had one.

## Square: you are right that it is not free

Cards would not need reshaping — every place that shows a cover already crops with `object-cover` into a fixed frame (4:3 on story cards and swipe, 21:9 or 16:9 on the wide views), so the source shape does not drive the layout. The real problems are composition and pixels:

- A square picture cropped to the 21:9 wide frame loses two thirds of its height. The model composes for the canvas it is given, so subjects it centres vertically in a square can end up cropped through the head.
- Social previews are 1200x630. A square crop gives 1024 across, so those previews would upscale slightly instead of downscaling.
- Reels are 9:16 and re-crop anyway — square is actually better there.

So square saves 31% but changes what the pictures look like. That is a quality decision, not a config change, and worth testing rather than assuming.

## Recommendation

Do the safe savings first, and test square before committing to it.

1. Send automated illustrations through the batch route for any story not yet published, rather than only stories older than 24 hours. Published stories keep generating instantly. Halves the automated half of the bill.
2. Tighten the regeneration cap from 3 to 2 and show the count on the story card, so a repeat is a visible choice.
3. Add prompt guidance that keeps the subject centred with headroom, so any crop is safe. Worth doing regardless of size.
4. Run a square trial: generate 20 automated Eastbourne images at 1024x1024 alongside the current landscape ones, and compare them in the feed and on a social preview before deciding. If they hold up, switch and take the 31%.

Expected: about **$13-15 a month** from steps 1-3, or roughly **$9-11** if the square trial passes and we switch.

## One thing to flag

GPT Image 1.5 is deprecated and OpenAI removes it from the API on 1 December 2026 [3](https://www.modellix.ai/blog/gpt-image-1-5-pricing/). Nothing breaks today, but the replacement should be chosen on quality in a separate piece of work rather than under deadline — and the newer models price differently, which may settle the square question for us.

## Technical notes

- `auto-illustrate-stories` currently picks batch vs instant on `created_at`; change to "not yet published" plus a short age check, keeping the existing instant fallback.
- `illustration-batch-poller` runs hourly and falls back to instant generation on any batch failure, so no story can be left without an image.
- Size is hardcoded as `1536x1024` in four places in `story-illustrator`; the square trial adds a per-call size rather than replacing the constant, and records the real size in `image_generation_metrics` so cost reporting stays accurate.
- Regeneration cap constant lives in `story-illustrator`; the count is on `stories.illustration_regen_count`.
- No schema changes needed.
