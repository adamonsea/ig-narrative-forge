
# Heroic Story Cards -- Arrivals & Publishing Flow Redesign

## The Problem

The current arrivals and publishing cards are dense, utilitarian, and feel like database rows -- not the editorial content they represent. The article cards in Arrivals show a horizontal bar of metadata (relevance %, word count, checkboxes) above a cramped title, with 3 inline dropdowns and a green "Simplify" button jammed into a grey footer. Published stories are marginally better but still lack visual impact -- tiny 16x16 thumbnails hidden on desktop, accordion-based slide previews, and action buttons scattered across the card.

For the core flow that delivers the most delight and control, these cards need to feel **valuable** -- like you're holding a piece of content worth publishing.

---

## Design Direction

Inspired by Linear's issue cards, Notion's database rows, and Apple News editorial cards:

- **Headline-first hierarchy**: Title is the hero, large and prominent
- **Visual presence**: Cover images shown inline when available, not hidden behind accordions
- **Clean action bar**: Primary action (Simplify/Publish) prominent, secondary actions as icon buttons
- **Metadata as subtle context**, not competing for attention with the headline
- **Remove inline configuration clutter**: Tone/style/slide-count dropdowns default from topic settings and only appear on hover or via a "Configure" expansion

---

## Arrivals Cards (MultiTenantArticlesList.tsx)

### Current issues:
- Checkbox + relevance score + relevance badge + word count + "Snippet" badge + author all crammed into one horizontal row above the title
- Title is `text-sm` and buried below metadata
- 3 Select dropdowns (slide count, tone, writing style) visible on every card even though most users accept defaults
- "Simplify" button uses a non-standard green color

### Redesigned card structure:

```text
+--------------------------------------------------+
|  [Source domain]    [Relevance pill]   [3d ago]   |  <- subtle metadata line
|                                                    |
|  Article Headline Here in Bold                     |  <- text-base/lg, font-semibold
|  by Author Name                                    |  <- text-sm muted
|                                                    |
|  keyword  keyword  keyword                         |  <- existing keyword badges
|                                                    |
|  [Simplify]              [Preview] [Source] [x]    |  <- clean action bar
+--------------------------------------------------+
```

**Key changes:**
1. **Promote title** to `text-base font-semibold` -- the headline IS the card
2. **Move metadata above title** as a subtle context line (source domain, relevance pill, age)
3. **Hide configuration dropdowns by default** -- use topic defaults. Add a small "Configure" toggle that reveals tone/style/slides inline only when clicked
4. **Simplify action bar**: Primary "Simplify" button left-aligned (uses `variant="default"` not custom green), icon-only secondary actions right-aligned
5. **Remove the checkbox from default view** -- show checkboxes only when bulk mode is toggled via a toolbar button
6. **Remove duplicate relevance display** -- currently shows both "Relevance: 65%" text AND a colored "65% (High)" badge. Keep only the colored pill
7. **Remove the grey `bg-muted/20` footer section** -- integrate actions into the card body with a subtle top border

### Bulk actions:
- Add a "Select" toggle button in the articles header that enables checkbox mode
- When off (default), cards are clean with no checkboxes
- Bulk delete toolbar appears only in select mode

---

## Published Stories Cards (PublishedStoriesList.tsx)

### Current issues:
- Cover image is a tiny 64x64 thumbnail hidden on mobile
- Slide preview requires expanding an accordion with individual textareas
- Action buttons (Preview, Generate Image, Animate, Archive, Source, Delete) are a cluttered row of small buttons
- Illustration management (generate, animate, delete) takes significant visual space

### Redesigned card structure:

```text
+--------------------------------------------------+
|  [Live pill]  [3 hours ago]            [...]      |  <- status + overflow menu
|                                                    |
|  +--------+  Story Headline Here                  |
|  | cover  |  by Author                            |
|  | image  |  6 slides  ·  142 words               |
|  | 80x80  |                                        |
|  +--------+                                        |
|                                                    |
|  [View in Feed]        [Preview]  [Archive]  [x]  |  <- clean actions
+--------------------------------------------------+
```

**Key changes:**
1. **Larger cover thumbnail** (80x80, visible on all screen sizes) placed left of the title
2. **Overflow menu** (`...` button) for low-frequency actions: Generate Image, Animate, Delete Illustration, Delete Animation, Return to Review, Source Link, Edit Links
3. **Only 3-4 visible action buttons**: "View in Feed" (primary), "Preview & Edit", "Archive", and delete
4. **Remove inline slide editing** from the main card -- move to a dedicated slide editor dialog (SlideEditor component already exists)
5. **Remove the accordion entirely** -- "Preview & Edit" opens the existing SlideEditor in a dialog/drawer
6. **Merge the scheduled/ready indicator bars** into a simpler inline badge next to the status dot rather than full-width colored bars

---

## Pipeline Container (UnifiedContentPipeline.tsx)

### Changes:
1. **Remove the inner `<Card>` wrappers** around articles and stories lists (lines 546-577, 651-668) -- the cards themselves provide structure
2. **Remove the description text** below the Arrivals tab ("Showing new articles awaiting review" + automation badge) -- the tab name is sufficient
3. **Remove the Insights tab entirely** -- it just contains a redirect button and CommunityPulseReview. Move insights to the main dashboard
4. **Simplify tab bar to 2 tabs**: "Arrivals (N)" and "Published" -- remove the Insights tab and the parliamentary/auto badges from the tab triggers
5. **Remove the parliamentary filter toggle** from Published -- move to the existing filter pills inside PublishedStoriesList (which already has filter buttons)

---

## Technical Implementation

### Files modified:

1. **`src/components/topic-pipeline/MultiTenantArticlesList.tsx`** (major rewrite of `renderArticleCard`)
   - Restructure card layout: metadata line -> headline -> keywords -> action bar
   - Hide checkboxes by default, add "Select" toggle
   - Hide config dropdowns behind a "Configure" expansion
   - Remove duplicate relevance display
   - Remove bg-muted footer, use subtle border-t

2. **`src/components/topic-pipeline/PublishedStoriesList.tsx`** (significant cleanup)
   - Enlarge cover thumbnail, make visible on mobile
   - Move illustration/animation actions into a DropdownMenu overflow
   - Remove inline accordion slide editing, use SlideEditor dialog
   - Simplify status indicators

3. **`src/components/UnifiedContentPipeline.tsx`** (structural cleanup)
   - Remove inner Card wrappers from tab content
   - Remove Insights tab
   - Remove description text and automation badges from tab area
   - Simplify tab triggers to "Arrivals (N)" and "Published"
   - Remove parliamentary filter (already handled by PublishedStoriesList)

### No database or edge function changes required.

---

## Before/After Summary

| Element | Before | After |
|---------|--------|-------|
| Article title | `text-sm`, buried below metadata | `text-base font-semibold`, hero position |
| Config dropdowns | 3 visible on every card | Hidden, revealed via "Configure" toggle |
| Checkboxes | Always visible | Only in bulk-select mode |
| Relevance display | Duplicated (text + badge) | Single colored pill |
| Card footer | Grey bg-muted section | Clean inline action bar |
| Published cover image | 64px, desktop only | 80px, all screens |
| Slide editing | Inline accordion with textareas | SlideEditor dialog |
| Published actions | 6+ visible buttons | 3 visible + overflow menu |
| Pipeline tabs | 3 (Arrivals, Published, Insights) | 2 (Arrivals, Published) |
| Card wrappers | Double-nested Cards | Single card per item |
