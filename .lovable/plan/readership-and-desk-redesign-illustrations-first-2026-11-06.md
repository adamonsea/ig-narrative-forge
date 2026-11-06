# Readership and Desk redesign: illustrations first

The rule throughout: the number is the biggest thing, the label the smallest. Pictures do the work that sentences used to do.

## Readership tab (desktop)

```text
+----------------------------------------------------------------------+
|                                                                      |
|   2,418                                  ▲ 12%                       |
|   reads this week                                                    |
|                                                                      |
|   ▂  ▃  ▅  ▄  ▆  ▇  █      seven bars, today is the mint bar,        |
|   M  T  W  T  F  S  S      the other days are soft navy, no axis     |
|                                                                      |
|  +--------------------------------------------+                      |
|  |                                            |                      |
|  |        TOP STORY ILLUSTRATION              |                      |
|  |        (full bleed, 16:9)                  |                      |
|  |                                            |                      |
|  |  ░░ dark fade at the bottom ░░             |                      |
|  |  612                                       |  <- huge number,     |
|  |  Headline in serif, two lines max          |     white on the fade |
|  +--------------------------------------------+                      |
|                                                                      |
|  <- swipe ->                                                         |
|  +---------+ +---------+ +---------+ +---------+                     |
|  |  illus  | |  illus  | |  illus  | |  illus  |   stories 2 to 5    |
|  |         | |         | |         | |         |   as illustrated     |
|  | 288     | | 201     | | 174     | | 96      |   cards, snap scroll |
|  | Headline| | Headline| | Headline| | Headline|                     |
|  +---------+ +---------+ +---------+ +---------+                     |
|                                                                      |
|  (Funnel and headline stop rates appear only above the reader floor, |
|   restyled the same way: big number, tiny label)                     |
+----------------------------------------------------------------------+
```

Mobile: same order in one column. The hero number shrinks a little, the top card goes full width, and the row swipes with the next card peeking in at the edge.

## Desk (Pipeline), Live column card

```text
+--------------------------------------------+
| [thumb] Headline of the live story...       |
|  ◉ mint ring if someone is reading it now   |
|                                       412   |  <- bold, readable, in navy
|                                ↑ rising     |  <- only one story, as now
+--------------------------------------------+
```

- The read count gets bold weight and a body-size number (about 18px), not muted grey.
- A story being read now (someone active on it in the last 5 minutes) gets a soft mint ring around its thumbnail. The ring breathes slowly, and stays still when the device is set to reduce motion.

## Motion

- On load, numbers count up over about 0.8 seconds, ending exactly on the real figure.
- The bars rise once, staggered.
- With reduced motion turned on, everything appears already finished.

## Brand only

- Navy #0B1522, mint #57FFB9 and purple #AD5CFF, all through the existing design tokens.
- Curatr's serif for headlines and the existing sans for numbers, with figures that line up.
- No new fonts and no new colours.

## Generic-AI audit: what gets removed

- **Filler labels:** "Top stories", "Best performer", "Trend" and the explanation sentence under the hero all go. The size and order of things already say this.
- **The sentence about the best story:** the big illustrated card replaces it.
- **Default card styling:** no grey borders, no white box with a shadow, no rounded box inside another box. The cards are just the illustration with the type set on top.
- **Small grey text:** the only small text is the one label "reads this week" and the dates under the bars. Everything else is a big number or a headline.
- **Unnecessary borders and dividers:** none between sections. Spacing separates them.
- **Icons used for decoration:** none, except the ▲/▼ change marker and the rising mark.
- **Stories with no illustration:** they show the feed's flat brand-colour block with the favicon, never a grey placeholder.

## Technical notes

- `get_topic_readership` gains 7 daily read totals plus a cover image for each of the top 5 stories. It keeps its tenant guard, and reads are counted the same way as before.
- `get_topic_pulse` gains a list of story IDs read in the last 5 minutes, for the thumbnail ring. It is still polled every 30 seconds.
- A small `useCountUp` hook and a `prefers-reduced-motion` check handle the motion. No new libraries.
- Files: `ReadershipPanel.tsx`, `PulseBits.tsx`, the Live column card in `UnifiedContentPipeline`, plus the two database functions. Tests are updated for the daily totals.
- Nothing will be published.
