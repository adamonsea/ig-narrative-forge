# Reviews: a look-back worth publishing

Two parts: put the tab where it belongs, then make the review itself genuinely worth reading.

## Part 1 — Where it lives

- **Rename "Insights" to "Reviews"** and move it to the far right of the tab bar, visually quieter than Pipeline and Editorial control. It's a few-times-a-year look back, so it shouldn't compete with daily work — but it doesn't belong inside anything else either.
- **Move Categories out of it** into Editorial control as a "Coverage categories" section. Deciding which categories exist and whether stories get classified is configuration, not publishing — and good classification is exactly what makes the reviews sharp.
- Old `?tab=insights` links keep working (redirect to the Reviews tab). The review's public pages and URLs are untouched.

## Part 2 — Getting real insight out of the archive

The review already computes a lot (category mix vs the previous period, sub-beat movers, spikes, rising and fading vocabulary, places, reader favourites, source scorecard, an AI editor's note). What's missing is the human story and the pictures. Additions:

**Narrative spine, not a stats dump**
- A **month-by-month timeline**: for each month, the defining story (most read, or the biggest spike that month), its cover image, and one line on what that month was about.
- **Turning points** — the two or three moments where coverage visibly changed direction, drawn from the existing spike detection but written as "when X arrived" rather than a table row.
- **What went quiet** — subjects that dominated the previous period and vanished. Absence is often the most interesting finding and we already compute it.
- **Recurring names and places** — the people, streets and institutions that kept coming back, each with a count and the story that mentioned them most.
- **A "how much" line in human terms** — total words, reading time, days covered, quietest and busiest weeks.

**Use the pictures**
- **Opening mosaic**: a wall of every cover illustration from the period, laid out as a dense grid that fades in on load, with the period label and headline over it. Instantly communicates scale and beauty of the archive.
- **Month filmstrips**: a horizontal run of covers per month, the defining story enlarged.
- **Chapter covers**: each section of the review (crime, council, community…) opens against a full-bleed cover image drawn from its best story of the period.
- **Then and now**: two covers side by side — the same subject early and late in the period.
- Images always link to their story, with source attribution preserved. Stories without covers fall back gracefully to typographic cards, never a broken grid.

**Feel**
- Scroll-driven: sections settle in as you reach them, numbers count up once, the mosaic parallaxes gently. Reduced-motion respected throughout.
- Reads as an editorial artefact — serif display headings, generous whitespace, hairline rules — not a dashboard.
- Share-ready: a proper social preview image built from the mosaic, and per-section share cards.

## What does not change

- Story gathering, scoring, publishing, the four-day window, the Pipeline.
- Existing review URLs and saved reviews (regenerating a review refreshes it in place).
- No new database tables; the review payload gains fields inside its existing `data` JSON.

## Technical notes

- `src/pages/TopicDashboard.tsx`: rename and right-align the tab (`ml-auto`), redirect `?tab=insights`, render only `PeriodReviewPanel` there.
- `src/components/topics/EditorialControlCenter.tsx`: new `coverage-categories` section rendering `CategoriesPanel`.
- `supabase/functions/generate-period-review/index.ts`: extend the computed payload with `monthChapters` (defining story + cover + count per month), `turningPoints`, `wentQuiet`, `recurringEntities` (with best story + cover), `mosaic` (cover URLs sampled across the period) and a reading-time figure; extend the AI editor's-note prompt to write the month lines and turning-point sentences from those figures only.
- `src/pages/PeriodReview.tsx`: restructure into mosaic hero → editor's note → month timeline → chapters with full-bleed covers → recurring names/places → what went quiet → reader favourites → sources. Intersection-observer reveals, `AnimatedNumber` reuse, `prefers-reduced-motion` honoured, lazy-loaded images.
- Old saved reviews lack the new fields — every new section renders only when its data is present.
