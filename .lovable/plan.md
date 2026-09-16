# A lighter editorial settings experience

## Direction

Replace the long Settings page with a calm, visual control centre. The page should answer four questions at a glance:

1. **What belongs in my feed?**
2. **How should it sound and look?**
3. **What happens automatically?**
4. **Where is it published?**

Use the existing typefaces, with clearer hierarchy rather than a typography redesign. Use a light version of the home-page palette so the product feels consistent. On desktop, use a compact editorial-dashboard overview; on mobile, collapse naturally into one focused column with no side-scrolling or dense control grids.

## Proposed structure

### 1. Editorial control

This becomes the first and most important settings area, with three distinct but connected panels:

- **Coverage — what belongs**
  - Move **News values** here.
  - Lead with the “How local?” dial and its plain-English outcome.
  - Keep nearby places and big-story exceptions directly beneath it, progressively disclosed.
  - Bring keywords, landmarks, organisations, postcodes and exclusions into the same coverage model instead of hiding them in “Keywords & Discovery”.
  - Show one short summary on the overview, such as “Balanced · 14 nearby places · big stories allowed”.
  - Put landmark descriptions and reference photos in a place-detail view, not in the main settings flow.

- **Voice & presentation — how stories feel**
  - Audience, tone, writing style, house-style guidance, examples and illustration style.
  - Show the current choices as a readable summary before opening the full controls.
  - Keep “Community Voice” separate and rename it to describe what it actually does, such as **Community signals**, because it monitors Reddit rather than defining writing tone.

- **Automation — what Curatr may do alone**
  - Show one clear current state: Manual, Assisted, or Automatic.
  - Reveal gathering frequency, story threshold, illustration threshold and drip publishing only when relevant.
  - Put a concise consequence beside every mode: what is gathered, what waits for review and what can publish unattended.
  - Keep automation visually distinct within Editorial control because it has greater publishing consequences than voice choices.

The three panels belong under one **Editorial control** heading, but they should not become one undifferentiated form.

### 2. Distribution

Group all reader-facing destinations together:

- Public feed status
- Email
- RSS
- Widget
- Daily and weekly audio
- Donations/revenue

The overview shows active channels as compact status rows. Detailed controls appear only after opening a channel. Subscriber management moves next to Email rather than living under “More”.

### 3. Identity

Combine the feed’s logo, icon, colour, strapline, welcome card and About page. Rename the current reader-facing “Onboarding” controls to **Welcome & About** so they cannot be confused with the creator setup guide.

### 4. Optional features

Place lower-frequency additions here:

- Local events
- Parliamentary tracking
- Insight cards
- Sentiment tracking
- Community signals

Only enabled features show detail. Disabled features remain concise rows with a switch and one sentence.

## Interaction strategy

- Start with a dashboard overview of the four groups, each showing its current state and the one most important control or action.
- Open one focused panel at a time; avoid nested cards and nested accordions.
- Use progressive disclosure for specialist controls, especially place reference photos, sentiment terms, channel analytics and scheduling thresholds.
- Standardise autosave: changes save quietly, one small persistent status communicates **Saving**, **Saved**, or **Not saved**. Remove success toasts for routine setting changes; retain clear error messages.
- Show consequences rather than implementation language. Replace terms such as “Auto-Simplify”, “scrape frequency” and ambiguous percentages with reader-facing outcomes.
- Preserve the News values live sample, but make it visual: **Publishes automatically / Waits for review**, with Home / Nearby / No recognised place beneath it.
- Keep all controls touch-friendly. On mobile, summaries stack, full panels become single-column sheets or inline sections, long lists use compact rows, and fixed-width selectors are removed.
- Preserve every existing capability and value; this is an information-architecture and interaction redesign, not a reset of settings.

## Setup and consistency

- Reuse the same editorial-control panels in initial feed setup and later settings instead of maintaining duplicate forms.
- Make setup a guided view of the same underlying controls: Sources → Coverage → Voice → Automation → Start gathering.
- Use the complete automation model in both places so returning to setup cannot overwrite Holiday or other advanced modes.
- Remove the unused competing-regions wiring now that nearby places is the authoritative control.
- Keep Sources in the Feed area, but link to Coverage when a source is supplying off-topic stories.

## Implementation shape

- Break the settings composition out of the oversized dashboard page into a dedicated settings workspace and focused section components.
- Refactor Coverage into a summary plus dedicated editors for discovery terms, exclusions, nearby places and place details.
- Consolidate settings writes behind one save-state pattern with rollback on failure.
- Continue using the existing database fields and business rules; no schema change is expected.
- Retain owner/admin access rules exactly as they are.

## Verification

- Test all existing settings paths for value preservation and correct saving, including Holiday mode and returning through setup.
- Confirm the News values preview still matches the live scoring rules.
- Test at desktop and phone widths, including long place names, many landmarks, failed saves and slow saves.
- Check keyboard navigation, focus order, labels, contrast and screen-reader announcements.
- Confirm routine saves no longer generate repeated success toasts, while failures remain unmistakable.

## Scope boundary

This pass reorganises and simplifies feed settings. It does not change scoring formulas, automation behaviour, publishing rules or the public feed design.
