# Home Page Editorial Refresh + Subtle Motion

Rebuild `src/pages/Index.tsx` to the selected "Editorial refresh" direction: same palette and type, stronger hierarchy, almost all iconography removed — plus restrained framer-motion delight that suits the editorial tone.

## What stays the same
- Colours: navy `hsl(214,50%,9%)` bg, mint `hsl(155,100%,67%)` and purple `hsl(270,100%,68%)` accents, white text.
- Type: Playfair Display (`font-display`) headlines + Inter body.
- All existing copy, sections, routing, auth logic, demo overlay, cookie consent, and footer links.

## Layout changes (icons removed)
1. **Remove iconography** — delete the `lucide-react` import and every accent icon tile across value props, distribution, AI tools, and the "You stay in control" list.
2. **Hero** — centred, italic Playfair "powered by AI", soft purple glow behind the headline; existing buttons kept.
3. **Value props (01–03)** — oversized Playfair numerals (mint / purple / muted white) instead of icon tiles, with a top hairline divider.
4. **Reach your audience everywhere** — editorial hairline grid: three bordered cells, "Channel 01/02/03" eyebrow labels, Playfair titles that go mint on hover.
5. **AI tools that drive engagement** — four `border-l` columns with italic Playfair sub-titles, no icon tiles.
6. **You stay in control** — split layout kept; the three icon rows become numbered text labels ("01 — Editorial pipeline", etc.); live-demo pipeline panel kept with Playfair numbers.
7. **Built for curators** — three use-case cards (already icon-free).
8. **Roadmap + final CTA + footer** — content/links kept, styling aligned to the editorial treatment; dynamic year and getlit.pro links preserved.

## Motion (framer-motion — subtle, not showy)
- A small reusable `Reveal` wrapper using `whileInView` (fade + ~12px rise, `once: true`, soft ease, ~0.5s) applied to section headings and content blocks.
- Light stagger on the value-prop numerals and distribution cells so they settle in sequence rather than all at once.
- Hero text/buttons do a gentle entrance fade-up on load.
- Buttons keep a quiet `whileHover` lift (small scale/translate) consistent with the current hover styles.
- Respect `useReducedMotion()` — when the user prefers reduced motion, render static (no transforms), so it stays accessible.

## Technical notes
- `index.html`: extend the Playfair Display Google Fonts import to include italic axes (currently only upright 500–700) so italic display text renders correctly.
- Keep the inline `hsl(...)` accent values already used in this file for consistency.
- `framer-motion` is already installed (^12). No backend, routing, or business-logic changes — purely presentational.
