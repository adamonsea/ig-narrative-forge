# Feed card typography: left-aligned, newspaper-style

Changes are in `src/components/StoryCarousel.tsx` only: `getTextSize` and the class names on the slide text. The font, capitals and weights stay as they are.

## 1. Proposed sizes

**Headlines (slide 1)**: Lexend semibold in capitals, line height **1.08** (now 1.625).

| Length | Phone now | Phone new | md and up, now → new |
|---|---|---|---|
| under 50 characters | 36px | **40px** | 48 → 60px |
| 50–79 | 30px | **36px** | 36 → 48px |
| 80 and over | 30px (24px from 100) | **32px** | 36 → 36px |

The large-screen size is removed, so the md size applies from md up.

**Later slides**: light weight, line height **1.35** (now 1.625). The tighter spacing makes room for the bigger text.

| Length | Phone now | Phone new | md and up, new |
|---|---|---|---|
| under 80 characters | 36px | 36px | 48px |
| 80–149 | 30px | 30px | 36px |
| 150–249 (most slides; median 202) | 24px | **26px** | 30px |
| 250 and over | 20px | **24px** | 28px |

**Last slide:** the main text uses the later-slide sizes. The credit/CTA block stays at its current small bold muted size, now left-aligned.

**Column:** all text is left-aligned. The column is up to **576px wide (`max-w-xl`)**, up from 512px. Padding changes from 24/32px to **20px at the sides on phones and 32px on md**. The bottom padding stays at 56/64px so text stays clear of the slide dots.

`text-balance` becomes `text-pretty`, which avoids single-word last lines without making left-aligned text look ragged. Text stays centred vertically in the card.

## 2. Worst cases on a 360–390px phone

Eastbourne's last 200 stories:

| Slide | Longest | 95% are under | Median |
|---|---|---|---|
| Headline | 95 characters | 90 | 76 |
| Later slide | 295 | 241 | 202 |
| Last slide | 275 | 233 | 193 |

- **Longest headline (95 characters at 32px, 335px column):** about 15 characters per line, so about 7 lines and roughly 245px high. It sits under the 320px picture, inside a card that is at least 600px tall and can grow, so it doesn't clip.
- **Longest later slide (295 characters at 24px light):** about 11 lines, roughly 360px high. The space available is about 430px with the dots clear. This is the tightest case.
- **Longest last slide (275 characters plus the credit):** similar height.

**Safety net:** later slides currently hide anything that overflows. If any case clips at 360px in the check, I'll add one smaller step for slides of 280+ characters rather than shrink every slide. I'll test at both 360px and 375px.

## 3. Where this card appears

**Affected, as intended**: all four use the same `StoryCarousel`:
- the main feed
- story pages
- daily roundups
- weekly roundups

**Not affected:**
- exported slide images, through `CarouselSlideRenderer.tsx` and `SimpleTextSlideRenderer.tsx`, each with its own `getTextSize`
- social packs and Reel Studio
- the archived `RoundupCarousel`

`getTextSize` lives inside `StoryCarousel`, so nothing else can pick up the change. Exports stay exactly as they are.

## 4. Check, before anything is published

1. **Before:** at 375px, take screenshots of Eastbourne stories: a short headline (under 50 characters), a typical one (about 76) and the longest (95). Capture slide 1 and slide 2 of each, plus a last slide with the credit.
2. Make the change.
3. **After:** take the same screenshots, plus the longest later slide and the longest last slide at 360px. Check nothing clips and the text stays above the dots.
4. Check one story page and one daily roundup look correct.
5. I'll put the before and after screenshots side by side in Files and share them in chat for your review. Nothing is published.

**Data note:** the test browser uses a `zztest_` visitor code, and cleanup deletes only that code.
