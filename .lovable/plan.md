# Pushing Creative and Premium towards a hand-made print

Image 2 Quick is already good enough — leave it alone. The work is on the two paid-for tiers, where the target is a picture that looks like a screen print you'd buy in a shop: a handful of big flat shapes, three inks, real paper grain, and confident hand-cut edges. Right now the wording asks for texture, grain, linework *and* cinematic depth all at once, and the models answer that by adding detail rather than removing it.

The fix is in the wording, tested on the comparison page first, and applied only to Creative and Premium.

## What changes

### 1. A "hand-made print" wording for Creative and Premium

Instructions that cap complexity instead of describing style:
- The whole picture built from roughly 8-15 large flat shapes; nothing smaller than a hand.
- Exactly three inks: black, paper white, one accent colour. No shading, no gradients, no mixed tones.
- Faces reduced to a nose line and a hair shape; no rendered expressions.
- Backgrounds as silhouette masses — trees as one shape, a crowd as one shape, water as repeating white flecks.
- Texture only from paper grain, flat speckle and slight registration shift — never from extra lines or cross-hatching.
- Hand-cut edges: slightly irregular, like lino or a cut stencil, not vector-smooth.
- One foreground subject, one middle ground, one background. Nothing else.

And removing what currently pushes detail up: "cinematic perspective with narrative depth", "intentional tonal shifts", and the location section's "authentic architectural details, proportions and distinctive visual features" (softened to recognisable silhouette only).

Quick keeps the current wording unless a test says otherwise.

### 2. A stronger style-reference instruction

When you attach your best 1.5 premium covers, the note will say to match the *amount* of detail, not just the look — same shape count, same flatness, same ink count — and that under-detailing is preferred to over-detailing.

### 3. A style toggle on the comparison page

A "Prompt style" switch with Current and Hand-made print, so you can run the same story and model twice and see them side by side. Results record which wording each picture used.

### 4. Only then, the live change

Once you pick a winner, the new wording becomes the Creative and Premium path in the shared prompt helper the live illustrator uses. Quick and everything else stay untouched until then.

## Technical notes

- `buildIllustrativePrompt` in `supabase/functions/_shared/prompt-helpers.ts` gains an optional `variant: 'current' | 'handmade'`, defaulting to `current`, so the live illustrator is unaffected until step 4.
- `image-model-bench` accepts `promptVariant` and passes it through; `STYLE_REFERENCE_NOTE` gets the detail-matching sentence.
- `image_bench_results` gains a `prompt_variant` text column (default `'current'`) so verdicts stay comparable.
- `ImageModelBench.tsx` gains the toggle, shows the variant in the cost estimate and as a badge in the results table.

## Suggested first run

Two or three stories, Image 2 at Creative and Premium (plus Sunburst high if you want the quality ceiling), your best 1.5 premium covers attached, once with each wording.
