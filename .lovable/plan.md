# Getting Image 2 to match the 1.5 premium print look

The reference image you shared is very reduced: a handful of big flat shapes, one accent colour, no small detail, no fine line work. Image 2 Quick is following the prompt faithfully but the prompt never tells it how *little* to draw — it asks for texture, grain, linework and cinematic depth, and a cheaper, faster model answers that by adding detail rather than removing it.

So the fix is in the wording, not the model. The plan is to test a reduced version of the wording on the comparison page first, then only move it into the live pipeline once you can see it matching.

## What changes

### 1. A "detail budget" added to the illustration wording

New instructions that cap complexity rather than describe style:
- Build the whole picture from roughly 8-15 large flat shapes; nothing smaller than a hand.
- Exactly three inks: black, paper white, one accent colour. No mixed tones, no shading, no gradients.
- Faces reduced to a nose line and a hair shape; no eyes drawn as detail, no expressions rendered.
- Background as silhouette masses only — trees as one shape, crowds as one shape, water as repeating white flecks.
- Texture comes from paper grain and flat halftone speckle only, never from extra lines or cross-hatching.
- One clear foreground subject, one middle ground, one background. Nothing else.

And removing the parts currently pushing detail upward: "cinematic perspective with narrative depth", "intentional tonal shifts", "authentic architectural details, proportions and distinctive visual features" in the location section (softened to "recognisable silhouette only").

### 2. A stronger style-reference instruction

When you attach your 1.5 premium covers, the note will explicitly say: match the *amount* of detail in the references, not just the look — same number of distinct shapes, same flatness, same ink count. Under-detailing is preferred to over-detailing.

### 3. A style toggle on the comparison page

A small "Prompt style" switch with two settings — Current and Reduced — so you can run the same story, same model, same references twice and see them side by side. The results table records which wording each picture used.

### 4. Only then, the live change

Once you pick a winner, the reduced wording replaces the current illustrative prompt in the shared helper used by the live illustrator, so every feed gets it. Nothing in the live pipeline changes before that.

## Technical notes

- `buildIllustrativePrompt` in `supabase/functions/_shared/prompt-helpers.ts` gains an optional `variant: 'current' | 'reduced'` argument, defaulting to `current`, so the live illustrator is untouched until step 4.
- `image-model-bench` accepts `promptVariant` and passes it through; `STYLE_REFERENCE_NOTE` gets the detail-matching sentence.
- `image_bench_results` gains a `prompt_variant` text column (default `'current'`) so verdicts stay comparable.
- `ImageModelBench.tsx` gains the toggle, includes the variant in the estimate line and shows it as a badge in the results table.

## Suggested first run

Two or three stories, Image 2 Quick only, your best 1.5 premium covers attached, once with each wording — six to eight pictures, under 10p.
