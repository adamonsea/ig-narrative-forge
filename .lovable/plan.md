# Image costs: what you pay, what you paid, and how to pay less

## Price per image today

We generate every illustration at 1536x1024 (landscape). OpenAI charges more for landscape than for square:

| Tier | Landscape 1536x1024 (what we use) | Square 1024x1024 | Landscape on the batch route |
| --- | --- | --- | --- |
| Quick | $0.013 | $0.009 | $0.0065 |
| Creative | $0.05 | $0.034 | $0.025 |
| Premium | $0.20 | $0.133 | $0.10 |

Square is about 31% cheaper at every tier. Batch is exactly half price but takes up to 24 hours.

## What you actually spent

August (last full month): **$24.52**
- 1,383 Quick images you triggered by hand: $18.15
- 478 Quick images from automation: $6.23
- 3 Creative: $0.15

Last 30 days: **$16.64**. September so far: **$4.11**.

## What the new regime saves — honest answer: very little

Checking the last 60 days of generations against the stories themselves:
- Every automated illustration was made within 24 hours of the story arriving, and the new batch route only applies to stories older than 24 hours. On current behaviour it almost never fires.
- The cap of 3 regenerations would have blocked 13 generations out of 2,154.

Projected monthly spend under the new regime as built: **roughly $23-24** — essentially unchanged.

The real cost is elsewhere: 915 of 2,154 generations (42%) were repeat images on a story that already had one, nearly all triggered by hand.

## Do we need images this big? No.

Nothing on the site ever shows the full 1536x1024 file. Feed cards, story pages and dashboards are all served a resized copy (around 800px wide), and social previews are 1200x630. A square 1024x1024 image cropped to landscape still gives 1024x683 — comfortably more than anything we display, including on high-resolution phones. The only place that wants more pixels is the reel export, which is tall 9:16 and re-crops regardless.

So we are paying a 31% landscape premium for detail no reader ever sees.

## Proposed changes

1. Generate at 1024x1024 and crop to landscape on save. Saves 31% on every image, with no visible quality change. Quick drops from $0.013 to $0.009.
2. Send automated illustrations through the batch route for any story not yet published, instead of only stories older than 24 hours. Published stories keep generating instantly. Halves the cost of the automated half of the bill.
3. Tighten the regeneration cap from 3 to 2, and show the count on the story card so it is visible before you spend another one.
4. Show a running monthly image spend figure on the feed dashboard alongside the per-feed breakdown already added, so a spike shows up the same week.

Expected result: roughly **$8-11 a month** instead of $24, with published stories still illustrated instantly.

## One thing to flag

The model we use, GPT Image 1.5, is deprecated and OpenAI removes it from the API on 1 December 2026 [3](https://www.modellix.ai/blog/gpt-image-1-5-pricing/). Nothing breaks today, but we will need to move to the current generation before then. I suggest a separate piece of work to test GPT Image 2.5 side by side on a few Eastbourne stories, so we pick the replacement on quality rather than under deadline.

## Technical notes

- `story-illustrator` hardcodes `size: '1536x1024'` in four places; switch to `1024x1024` and centre-crop to 3:2 during the existing WebP processing step before upload. Keep the recorded `size` accurate in `image_generation_metrics` so cost reporting stays right, and update the per-tier cost constants.
- `auto-illustrate-stories` currently picks batch vs instant on `created_at`; change to "not yet published" plus a short age check, keeping the existing instant fallback.
- `illustration-batch-poller` already runs hourly and falls back to instant generation on any batch failure, so no story can be left without an image.
- Regeneration cap constant lives in `story-illustrator`; the count is on `stories.illustration_regen_count` and can be surfaced on the pipeline card.
- No schema changes needed.
