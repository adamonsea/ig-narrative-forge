# Period Review: Trend Lines & Word Popularity Over Time

## What we have now
- Monthly story counts (timeline bars) — yes.
- Rising/fading vocabulary (this period vs. previous) — yes.
- Anomaly spike cards (term × month) — yes.
- **Missing:** continuous month-by-month plotting of a word/phrase's popularity — the "rise and fall" curve the user is asking about.

The edge function already builds per-month counts for every term internally (`termMonth`) but only keeps the peak. So this is a data-retention + presentation change, not new computation.

## Changes

### 1. Edge function: `generate-period-review`
- Export `termTrends`: the top ~8 terms by total volume (min threshold, e.g. ≥6 mentions, spread across ≥3 months), each with its full monthly series aligned to the existing `timeline` months: `{ term, total, series: number[], peakMonth, trend: 'rising' | 'falling' | 'spiky' | 'steady' }` (trend from first-half vs second-half average).
- Export `categoryTimeline`: monthly story counts per top category, so category momentum can be plotted too.
- Keep payload size bounded (8 terms × ≤12 months — trivial).
- No schema change: everything lands in the existing `review` JSON.

### 2. Frontend: `src/pages/PeriodReview.tsx`
- New chapter **"The words that defined the year"**: animated SVG line/area chart, one line per term (or a selectable/chip-toggle set to avoid spaghetti). Lines draw in on scroll (stroke-dashoffset animation), with a count-up of total mentions and a trend badge (▲ rising / ▼ fading / ⚡ spiked).
- Category momentum mini-chart: stacked or multi-line view of top 4–5 categories per month.
- Hover/tap tooltip showing exact count per month (accessible: also rendered as a visually-hidden table).
- Respects `useReducedMotion` — static render when reduced motion is on.
- Reuses `ReviewChapter`, `MaskRevealHeading`, `editorialEase`; old reviews without `termTrends` simply hide the chapter (graceful fallback).

### 3. Narrative tie-in (optional, cheap)
- Feed the top rising/falling/spiking terms into the existing LLM narrative prompt so the editor's note can reference "the month X took over" — one sentence added to the prompt, no structural change.

## Verification
- Regenerate an Eastbourne review from the Insights tab; confirm `termTrends`/`categoryTimeline` populate and the new chapter animates.
- Confirm an older review (pre-change) still renders without the new chapter.
- Check reduced-motion rendering and mobile layout.

## Technical notes
- All computation reuses `extractTerms` and the existing `termMonth` map — no extra DB queries.
- No migration needed; `period_reviews.review` is JSON.
- Old reviews unaffected (chapter hidden when data absent).
