# Desk redesign: news and events, clean cards

Mostly a presentation change. Every existing data call, handler and action stays; things only move. Built one phase at a time, stopping after each for you to check. Nothing gets published.

## Phase 1: story cards with three states

**At rest** (thumbnail, headline at 18px, one quiet line at 14px+)
- Live / Ready / Draft: source · time ago · reads (only when above 0). Reading-now ring and "Rising" stay. Badges only when true: Scheduled (with time), Ready, Draft, Failed.
- Waiting: source · time ago, plus the duplicate marker when there is one. The "N similar from other sources" fold stays.
- Removed from the resting card, moved into the drawer: word counts, slide counts, author, relevance %, freshness tag, Snippet tag, keyword chips, Animated tag.

**On hover (tap on phones): at most two buttons**
- Waiting: Publish (the existing Simplify: writes the story using the feed's default length, tone and style) and Skip (the existing delete). The duplicate warning before publishing stays.
- Live: Open, Unpublish. Ready / Draft / Scheduled: Publish now, Open.
- On phones, the first tap shows the buttons; tapping the headline opens the drawer.

**Open: a right-hand drawer for that story**
- Header: large picture (static, plus animated if there is one), headline, source · time · slide count.
- Picture: regenerate cover, Animate, delete animation, delete picture.
- Words: the slide list with Edit / Save and Links. Word counts live here.
- Share: View in feed, Reel.
- Footer: Source article link, plus a "…" menu with Assign time, Archive, Delete.
- Waiting stories instead show: the article preview with keyword highlighting (moved out of the pop-up), Length, Tone and Writing style (defaulting to the feed settings), the "make a picture" switch, relevance, freshness and keywords, Publish / Skip, and Suppress in the "…" menu.

**Other parts**
- "Writing…" and failed items stay as slim rows with a cancel ×. "Recover stuck" only shows when something is stuck.
- One filter icon opens a small popover holding All / Regular / Parliamentary, source, sort and refresh. Parliamentary is hidden when there are none.
- Waiting tools that don't fit on a card (Select and bulk delete, delete-below-relevance, show duplicates) move into one small "…" menu above the Waiting list.
- Pagination and "Load older stories" are unchanged.

Stop for you to test.

## Phase 2: the Desk in three areas

Desktop (1024px and wider): three columns using the full page width. Phones and narrower screens: one column with a three-way switch at the top (Happened / Live now / Coming up), opening on Live now.

- **Happened** (left): waiting news only. Header shows "14 new" and a settings icon. That icon opens the news settings: Autopilot on/off and pace (the existing Settings control), show duplicates, and bulk select. When nothing is waiting, it shows "All caught up" plus the next gather time.
- **Live now** (centre): exactly what readers see, in feed order, with the What's on set at its real feed positions. Small live dot in the header, plus a pulse figure (see Decisions below). "The weekly email takes what's here" stays as a quiet footnote.
- **Coming up** (right): waiting events only, soonest first. Each card has a date tile (day plus number), a countdown ("in 6 days" / "today" / "tomorrow"), and Publish / Skip on hover. Low-relevance and out-of-area events sit at the bottom, faded. A quiet "Hidden (n)" link sits at the bottom with Restore. The header shows "9 events this week" plus a settings icon holding the Events switch, Let readers suggest events, and Show in the feed.
- When Events is off, Coming up becomes one slim card: "Add what's on to your feed" with a switch-on button.
- Past events drop out of Coming up and Live automatically, using the same rules as the feed.
- Story and Event chips are gone. News and events no longer share a list.
- The month-ahead tiles (Today / Tomorrow / This week / This month) leave the news column. To keep the capability, they move unchanged behind a quiet "Month ahead" link at the bottom of Coming up.

Stop for you to test.

## Phase 3: hooks for your animations

Simple 200ms fades for now. Each moment gets a stable class and a data attribute for you to replace:
- `desk-arrive`: a new card entering Happened or Coming up
- `desk-to-live`: a card landing in Live now after Publish
- `desk-expire`: an event leaving when it's past
- `desk-drawer`: the drawer opening

These replace the current spring slide on Waiting cards. Reduced-motion users get no movement.

## Decisions to confirm (defaults in bold)

1. **"312 readers today"**: the pulse data has *reads today* and *reading now*, not readers. Project rules say reader figures only come from the guarded readership count. Default: **show "N reads today · N reading now"**, hidden when zero.
2. **"9 events this week"**: default **counts every event, live and waiting, in the next 7 days**, matching the This week tile.
3. **Waiting "Publish"** means **start writing it now** (today's Simplify). It appears in Live as "Writing…" and then publishes as it does today.

## Checks after each phase
- Run every action on the list in your brief in a signed-in browser, at 390px and 1280px. I'll sign in as your own account (no new test accounts). Watch for console errors.
- The public feed has no changes at all. I'll confirm its files are untouched.
- Unit tests for the new pure rules (countdown wording, Coming up ordering with low-relevance last, the this-week count), next to the existing `whatsOn` tests.

## Technical notes
- Phase 1 files: `PublishedStoriesList.tsx` and `MultiTenantArticlesList.tsx`, plus new `topic-pipeline/StoryDrawer.tsx`, `topic-pipeline/DeskCard.tsx` (the shared rest/hover shell) and `topic-pipeline/StoryFilters.tsx`. The preview dialog's highlight code moves from `UnifiedContentPipeline.tsx` into the drawer, with the same function.
- All handlers keep their current signatures and hooks (`useMultiTenantTopicPipeline`, `useEventDesk`, `useEventDeskActions`, `useTopicPulse`, `whatsOnPositions`). No database, edge function or feed changes.
- Phase 2 files: `UnifiedContentPipeline.tsx` and `DeskEvents.tsx`, plus new `events/ComingUpColumn.tsx`. The `extraItems` / `showTypeChips` props and `TypeChip` are removed.
- Type scale on the Desk: headline `text-lg`, body `text-base`, meta `text-sm` minimum. No `text-[10px]` or `text-[11px]`. Existing fonts and colour tokens only.
- Motion hooks are CSS classes in `index.css` (`.desk-arrive`, `.desk-to-live`, `.desk-expire`, `.desk-drawer`), with `data-motion` attributes on the elements.
