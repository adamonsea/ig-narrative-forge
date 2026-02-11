

# Topic Dashboard UX Simplification -- Google-Like Redesign

## Current State: What's Wrong

The topic dashboard at `/dashboard/topic/:slug` is a 1,169-line page with significant cognitive overload:

**Header area:**
- Large 56px topic icon + name + description + publish toggle + "View Feed" button -- 4 competing visual elements
- Breadcrumbs rendered twice (once in AppLayout, once manually in the page itself)

**Tab structure (3 tabs):**
1. **Content Flow** -- ManualContentStaging + UnifiedContentPipeline (the core workflow, correctly prioritized)
2. **Sources** -- TopicAwareSourceManager (clean, single purpose)
3. **Advanced Tools** -- 8 accordion sections with 20+ toggles, creating a "wall of settings"

**Advanced Tools breakdown (the problem area):**
- Content & Voice (4 dropdowns + save button)
- Automation & Scheduling (automation settings + drip feed)
- Branding & Onboarding (logo, subheader, welcome card, onboarding sequences)
- Distribution & Monetization (widget builder, RSS, email, audio daily/weekly, donations -- 7+ toggles)
- Feed Insight Cards (quiz, momentum, social proof)
- Keywords & Discovery (keyword manager, negative keywords, competing regions, sentiment, community voice)
- Regional Features (parliamentary, events -- conditional)
- Subscribers (newsletter signup manager)

This is overwhelming. Google-like means: **show what matters, hide everything else until needed.**

---

## Proposed Redesign

### 1. Eliminate duplicate breadcrumbs
Remove the manual Breadcrumb block from TopicDashboard.tsx (lines 649-661). AppLayout already renders breadcrumbs via `getBreadcrumbs()`.

### 2. Simplify the header to essentials only
Strip the header down to:
- Topic name (smaller, `text-xl`)
- Publish toggle (inline, right-aligned)
- "View Feed" as an icon-only button (no text label)
- Remove the large icon/avatar block and description text (they add visual weight but zero utility for a page the curator visits daily)

Think: Google Search Console project header -- just the name and a few action icons.

### 3. Restructure tabs: 2 tabs instead of 3
Rename and consolidate:
- **Feed** (replaces "Content Flow") -- the pipeline, manual staging, gathering
- **Settings** (replaces "Advanced Tools") -- everything else

Remove the "Sources" tab entirely and fold source management into the Feed tab as a collapsible section below the pipeline. Sources are directly related to content flow, not a separate concept.

This reduces the tab bar from 3 equally-weighted options to 2, where one is clearly "do work" and the other is "configure."

### 4. Flatten the Advanced Tools accordion
Replace 8 accordion sections with a single scrollable settings page organized by simple section headers (no expand/collapse). Google-style settings pages (Gmail Settings, YouTube Studio) use flat lists with clear headings, not nested accordions.

Group into 3 clear sections with `h3` dividers:
- **Voice** -- expertise, tone, style, visuals (the 4 dropdowns, auto-save on change, no save button)
- **Automation** -- publishing mode, drip feed, scraping schedule
- **Channels** -- RSS, email, audio, widgets, donations (all toggles in a clean list)

Move Keywords & Discovery, Regional Features, Branding, Onboarding, Insight Cards, and Subscribers into a "More" overflow or a separate `/settings` sub-route, since these are set-once-and-forget configurations.

### 5. Auto-save everywhere
Remove all "Save Changes" buttons. Every dropdown and toggle should save immediately on change (like Google Docs settings). The ContentVoiceSettings component currently requires clicking "Save Changes" -- switch to `onBlur`/`onValueChange` auto-save with a subtle toast.

### 6. Remove visual noise
- Remove all `HelpCircle` tooltip icons -- the labels should be self-explanatory
- Remove description text under toggles (e.g., "Allow subscribers to access this feed via RSS" under RSS toggle -- the label "RSS Feed" is sufficient)
- Remove the `Badge variant="secondary"` on Audio Briefings ("Premium") -- pricing info doesn't belong in the settings UI
- Remove emoji from select options (the lightning bolt and theatre mask on Satirical/Rhyming Couplet)

---

## Technical Changes

### Files modified:
1. **`src/pages/TopicDashboard.tsx`** -- Major restructure:
   - Remove duplicate breadcrumb (lines 649-661)
   - Simplify header (lines 663-708)
   - Change tabs from 3 to 2 (Feed + Settings)
   - Move source manager into Feed tab
   - Replace accordion in Settings tab with flat sections
   - Remove ~200 lines of stat-loading code that's only used for progressive disclosure (line 642) but never actually gates any UI

2. **`src/components/ContentVoiceSettings.tsx`** -- Auto-save on change instead of requiring a Save button. Remove the `hasChanges` state and Save button entirely.

3. **`src/components/RegionalFeaturesSettings.tsx`** -- Already auto-saves (good). No changes needed.

4. **`src/components/TopicSettings.tsx`** -- This 795-line component appears to be a legacy duplicate of the settings now handled by ContentVoiceSettings, TopicAutomationSettings, etc. Verify it's unused and remove if so.

### Files potentially removed:
- `src/components/TopicSettings.tsx` (if confirmed unused -- the accordion sections in TopicDashboard use the newer, focused components instead)

### No database or edge function changes required.

---

## Before/After Summary

| Aspect | Before | After |
|--------|--------|-------|
| Tabs | 3 (Content Flow, Sources, Advanced) | 2 (Feed, Settings) |
| Settings UI | 8 nested accordions | Flat scrollable sections |
| Header elements | 5 (icon, name, desc, toggle, button) | 3 (name, toggle, icon button) |
| Save buttons | Multiple explicit saves | Auto-save everywhere |
| Breadcrumbs | Rendered twice | Once (via AppLayout) |
| Tooltip icons | 3+ HelpCircle icons | 0 |
| Toggle descriptions | Verbose paragraphs | Labels only |

The result: a topic page that feels like managing a YouTube channel in YouTube Studio -- clean, purposeful, and fast to navigate.

