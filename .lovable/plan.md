# Insight reports: colour, texture, image grids, richer reveals

The review pages are typographically sound but visually flat: white/black/muted slides, grey bars, no imagery beyond three thumbnails. This adds a feed-derived colour system, grain, story image grids and a set of reveal animations — without adding cognitive load.

## 1. A colour system that belongs to the feed

Feeds have no stored brand colour today, so derive one deterministically: hash the feed slug into a base hue, then give each chapter a hue offset along a fixed editorial ramp (base, +28, +56, -32...). Every slide gets:

- A soft full-bleed gradient wash (two-stop radial + linear, low saturation, ~8-14% alpha over the background) instead of the current flat `default / inverted / accent` tones.
- An accent colour used for figures, bars, badges and sparkline strokes on that slide only.
- The same hue on both light and dark backgrounds, with alpha and lightness tuned so contrast stays WCAG AA.

Chapters keep an alternating light/dark rhythm so the deck still breathes; the gradient sits on top of that, not instead of it.

## 2. Noise texture

A single reusable grain layer (inline SVG `feTurbulence` as a data-URI background, ~3-5% opacity, `mix-blend-overlay`) applied above the gradient and below content on every slide. One component, no image assets, no layout cost.

## 3. Image grids that link to stories

New chapter type: for each of the top beats (and each sub-beat deep dive), show a grid of story cover images for stories in that category, each linking to the story.

- Layout: golden-ratio grid — one large lead tile (≈62%) plus a column of smaller tiles, falling back to a 2x2/3x2 uniform grid on narrow screens.
- Motion: tiles stagger in on scroll with a scale-from-0.94 + clip-path wipe; a slow parallax drift on the lead tile; hover/tap lifts the tile and reveals the headline over a gradient scrim.
- Stories without a cover render as a typographic tile (headline on the chapter's gradient), so grids never look broken.

This needs data the generator doesn't currently emit: `categoryStories` — up to 6 stories per top category (`id`, `slug`, `title`, `cover_illustration_url`, `created_at`), picked by engagement then recency. Added to the review `data` JSON; existing keys unchanged. Older reviews without the key simply skip the image chapters, and can be regenerated.

## 4. Figures and facts that perform

Replace the current single fade-and-count with a small vocabulary of reveals, each used deliberately:

- **Phase cascade** — big figures split into digit groups that rise and settle in sequence, so the number assembles rather than appears.
- **Shimmer sweep** — a one-shot specular sweep across a headline figure the moment its count-up lands, keyed to the slide's accent colour.
- **Odometer count-up** — digits roll individually with easeOutExpo, replacing the flat number swap.
- **Draw-in** — bars, sparklines and the month-by-month chart animate from zero with a light overshoot instead of a linear grow.
- **Weighted stagger** — list rows and chips enter with decreasing delay so the eye lands on rank one first.

All of it respects `useReducedMotion` (already used throughout): reduced motion renders the same layout, statically, with final values shown.

## 5. Hierarchy and restraint

- Golden-ratio scale applied to slide type: hero figure : supporting figure : caption at roughly 1.618 steps, and grid proportions on the same ratio.
- One idea per slide stays the rule — colour and motion reinforce the single figure, never compete with it.
- At most one shimmer and one cascade per slide; grids animate once and then hold still.

## Technical notes

- New: `src/lib/reviewPalette.ts` (slug hash → hue ramp, gradient and accent CSS values via HSL tokens), `src/components/review/GrainOverlay.tsx`, `src/components/review/StoryImageGrid.tsx`, `src/components/review/Odometer.tsx` and `Shimmer.tsx`.
- Changed: `ReviewSlide.tsx` gains `accentHue` / gradient + grain rendering and drops the flat tone-only backgrounds; `ReviewChapter.tsx`'s `CountUp` delegates to the odometer; `PeriodReview.tsx` threads the palette through and inserts the new image-grid chapters after the beats and deep-dive slides.
- Changed: `supabase/functions/generate-period-review/index.ts` emits `categoryStories`; the Eastbourne review is regenerated after deploy.
- Images use the existing Supabase render/image transform endpoint with `loading="lazy"` and fixed aspect boxes so the scroll stays smooth; grids are lazy-mounted per slide.
- Colours are emitted as HSL custom properties on the slide element — no hardcoded Tailwind colour utilities in components. Multi-tenant: nothing topic-specific, every chapter hides itself when its data is empty.

## Order

1. Palette + grain + gradient slides (the biggest visual shift, zero new data).
2. Reveal vocabulary: odometer, cascade, shimmer, draw-in.
3. Generator change for `categoryStories`, then the image-grid chapters.
4. Regenerate Eastbourne and review the whole deck on mobile and desktop.
