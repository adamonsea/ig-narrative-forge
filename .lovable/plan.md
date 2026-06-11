# Kinetic H1 Reveal for the Landing Hero

## Goal
Make the landing page headline animation noticeably more dynamic. Apply the selected "Kinetic editorial reveal" motion — a per-word masked slide-up where each word rises from behind a clipping mask in sequence — to the existing hero H1, without changing the current dark theme, typography, colors, or copy.

## Scope
File: `src/pages/Index.tsx` (hero section only, lines ~75–102).

Current H1:
```
Your niche news feed,
powered by AI   (italic)
```
It animates with a single fade + 12px slide. We replace that with a word-by-word masked reveal.

## What changes
1. **Add motion variants** for the kinetic reveal near the existing `reveal`/`container` definitions:
   - A `maskWordContainer` variant that staggers children (~0.09s stagger, small initial delay).
   - A `maskWord` variant: `hidden { y: '110%' }` → `show { y: 0 }` with the editorial easing `[0.19, 1, 0.22, 1]` and ~0.9s duration.
   - Respect `useReducedMotion`: when reduced, words appear with no transform (instant/opacity only).

2. **Restructure the H1** so each word is wrapped for masking:
   - Outer `motion.h1` keeps current classes (`text-6xl md:text-8xl font-display ... text-white`) and uses `variants={maskWordContainer}`.
   - Each word becomes a `<span>` with `overflow-hidden inline-block` (the mask) containing a `motion.span` (`inline-block`, `variants={maskWord}`).
   - Preserve the existing line break and the italic styling on "powered by AI".
   - Add small horizontal padding/`pb` on word spans if needed so descenders/italics aren't clipped.

3. **Keep** the subtitle, CTA buttons, and their existing `reveal`/`hoverLift` motion unchanged so the staggered cascade still flows hero → buttons.

## Technical notes
- Reuse the existing `initial="hidden" animate="show"` driver on the hero `motion.div`; the H1 gets its own nested container variant so words stagger independently of the paragraph/buttons.
- A helper to split each line into word spans keeps JSX clean (e.g. map over an array of words per line), while keeping the `<br />` and italic span intact.
- No new dependencies — `framer-motion` is already imported and in use.
- No backend, routing, or content changes.

## Verification
- Load the preview landing page and confirm each word of the headline rises into place in sequence, then the subtitle and buttons follow.
- Toggle OS "reduce motion" and confirm the headline appears without the slide.
- Confirm italics/descenders on "powered by AI" are not visually clipped by the mask.
