# Story cards: fit-to-card body text and a single call to action on the last slide

## 1. Body text sized to fill the card (slides 2 and later)

**Today:** slides 2+ get one of four fixed sizes based on how long the text is (`getTextSize` in the story carousel, 24 to 36px on phones). Short and medium slides leave a lot of empty space at the bottom.

**Change:**
- One size per story, worked out before the card is shown. Each later slide is measured off-screen at the card's real text width and height, with space kept clear for the dots. The size starts at 40px and steps down 2px at a time until the longest slide fits. Line height stays the same at every size.
- Every slide in the story uses that size. I recommend this over sizing each slide separately. Separate sizes would make the text change size on every swipe, which reads as a glitch, and slides are all 30–40 words, so a shared size loses very little space.
- Smallest size is 20px. If a slide still doesn't fit at 20px, that slide scrolls inside the card with a soft fade at the bottom, like now, and the other slides keep the shared size. With today's word limits this shouldn't happen: the longest Eastbourne slide is about 300 characters, which fits at about 26px.
- **No jump or flicker:** the size is set before the first paint, and the text stays hidden until it's measured, which takes under one frame. The size is saved for each story, so swiping and scrolling back never re-measure. It re-fits only when the card width or height changes, such as on rotation or resizing a window, and only after the change has settled. Font loading is awaited, so a late font can't shift the size.
- **Slide 1 headlines are unchanged.**

## 2. Last slide: one call to action

**Where each line comes from today:**

| Line | Source |
|---|---|
| Discussion or share prompt inside the story text ("Discuss with others…", "Share this update…", "Explore further…") | Written by the AI. The writing instructions in `enhanced-content-generator` tell it to add calls to action like "share with friends", "discuss with others", "read more", "explore further". |
| "Reported by sussexexpress.co.uk" | Added when the card is shown (`buildBylineLine`) |
| "Share this with someone who follows Eastbourne." | Added when the card is shown (`buildShareCta`) |
| "Read the full story at …" text link | Added when the card is shown (`parseContentForLastSlide`) |
| Bottom pill "from sussexexpress.co.uk" | The card's footer, shown on every slide |

`stripGeneratedSourceAttribution` only removes AI-written "Source: …" credits. It doesn't touch any of the lines above.

**New last slide:**
- The story text, then "By {reporter}" only when we have a usable reporter name. The name is tidied first: a leading "By" is dropped, so "By Amna Zaman" doesn't become "By By Amna Zaman". Usernames like "jefftravis" and empty values show nothing.
- "Reported by", the share line and the "Read the full story" text link are all removed.
- The pill on the last slide only becomes a bright button in the feed's own colour, with contrast-checked text from the same helper as the sign-up card: "Read the full story at sussexexpress.co.uk". It opens the article. On other slides the pill stays as it is now.
- The WhatsApp and Share buttons under the card stay.

**Existing stories (fixed when the card is shown, stored text untouched).** The AI's prompt sentence is removed only if it is the **last or second-to-last sentence of the last slide** and **starts with** one of these:
- "Share this / Share the / Share details / Share your"
- "Discuss with / Discuss the / Discuss your"
- "Explore further / Explore the"
- "Read more on / Read more about"
- "Have you … ?" (a question sentence only)

A sentence is **never** removed if it contains a number, phone number, "101", "999", "quote", "serial", "contact", "call", "report it", a web address or an email address. This keeps real police and missing-person appeals. A matching sentence that ends with practical detail, such as "Share this appeal … to help trace Arthur", is still removed, but the appeal details in the next sentence stay.

**Before and after on 10 real Eastbourne last slides** (removed text in brackets):
1. "…access from Chichester to the chalk ridge. [Have you walked the new stretch yet? Share your thoughts with other walkers.]"
2. "…once collection boxes for paper poppies are tallied. [Read more on community efforts across East Sussex or share this story with neighbours.]"
3. "Whether the kiosk becomes a coffee hatch or snack bar rests with the winning bidder. [Discuss with others what kind of takeaway should open next to the pier.]"
4. "Callers must quote serial 1467 of 04/11 when speaking to officers. [Share this report with local contacts to assist the search.]" The first sentence stays because it has a number and "quote".
5. "[Share this appeal with friends and neighbours across Brighton and Sussex to help trace Arthur.] Anyone with fresh sightings is urged to contact emergency services immediately." The second sentence stays because it has "contact".
6. "Reports can be submitted online or by calling 101, quoting serial 466 of 05/11. [Share this report to help reach local drivers.]"
7. "…before the curtain rises in Eastbourne." Starts with "Explore the schedule with friends or discuss…", so it is removed: "Box office bookings are now open for the production ahead of opening night. [Explore the schedule…]"
8. "Today the reserve forms part of the King's Series of National Nature Reserves declared earlier this year. [Explore further to see how traditional grazing methods are restoring sensitive Sussex landscapes.]"
9. "…leaves Eastbourne 3.5 points clear of Falaise at the top of the East Division." Unchanged, because there's no prompt.
10. "Former military personnel marched along South Street for the final parade…" Unchanged.

**Known miss, left alone on purpose:** a prompt woven into a real sentence, e.g. "Check national vehicle regulations carefully before buying transport gifts this winter, and discuss the rules with friends." It doesn't start with a trigger word, so it stays. Cutting part of a sentence risks garbling real reporting. New stories won't have this problem.

**New stories:** remove the "CTAs should be…" line and the "discuss this story" wording from the writing instructions. Add: "End the final slide on a fact from the story. No calls to action, questions to the reader, or invitations to share, discuss or read more." The existing "never name the publication or author" rule stays.

## 3. Other places that show stories
- **Social pack export** (`CarouselSlideRenderer` and `useCarouselExport`) has its own copy of the last-slide logic and adds "Reported by {publication}". It gets the same prompt removal and "By {reporter}" byline. The source credit stays in the image and caption, because a shared image needs it.
- **Reels** draw their own "Read the full story" end card. The slide text they show gets the same prompt removal. The end card is unchanged.
- **Widget** shows only headlines and images, so it is unaffected.
- One shared helper, `cleanLastSlide()`, does the removal and the byline for all three, so they can't drift apart.

## Checks
- Unit tests: the 10 examples above, plus protected sentences (numbers, 101, contact, quote, web address), "By By" tidying, the username case and an empty author.
- A database-only report across all published Eastbourne stories, listing every sentence that would be removed, so you can scan it before I switch anything on. Nothing is written.
- Screenshots at 375px and 412px, in light and dark mode, of a short, a typical and the longest story (slide 2 and the last slide). Plus a rotation check, and a swipe recording to confirm the text size doesn't jump. The test browser uses a `zztest_` visitor and I'll clean up only that visitor.
- Nothing is published.

## Technical details
- New `src/lib/slideTextFit.ts` with a `useStoryFontSize(slides, containerRef)` hook. It uses a hidden measuring element with the same font, padding and width, a binary search between 20 and 40px, a 2px step, and a `ResizeObserver` with a 150ms settle delay. Results are cached by story id plus width and height.
- New `src/lib/lastSlide.ts`: `stripReaderPrompts(text)`, `cleanAuthor(author)`, `buildLastSlide(...)`. `buildBylineLine` and `buildShareCta` stop being used in reader views.
- The last-slide pill colour comes from `feedBrandPalette()` / `buttonTone`.
- Writing-instruction edits are in `supabase/functions/enhanced-content-generator/index.ts`, at the slides prompt and the caption prompt.
