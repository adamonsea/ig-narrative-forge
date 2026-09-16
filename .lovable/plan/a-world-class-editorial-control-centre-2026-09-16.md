# A world-class editorial control centre

## Direction

Replace the long Settings page with a calm, visual control centre built around decisions, confidence and exceptions—not a catalogue of settings. It should answer five questions at a glance:

1. **Is my feed healthy?**
2. **What belongs in it?**
3. **How should it sound and look?**
4. **What may happen without me?**
5. **Where does it reach readers?**

Use the existing typefaces, with clearer hierarchy rather than a typography redesign. Use a light version of the home-page palette so the product feels consistent. On desktop, use a compact editorial-dashboard overview; on mobile, collapse naturally into one focused column with no side-scrolling or dense control grids.

The experience should feel like an editor’s morning briefing: show what is working, surface only what needs judgement, and keep the machinery out of the way.

## The control-centre overview

The first screen is not a settings form. It is a concise operating view with:

- **Feed status:** Live/paused, last successful gathering, next scheduled run and any issue requiring attention.
- **Today’s flow:** Arrived → selected automatically → waiting for review → published, using real counts and one restrained visual.
- **Needs your attention:** only genuine exceptions, such as uncertain locality, a failed channel or an unusually large review queue. Each item links directly to the decision.
- **Editorial policy summary:** a human-readable sentence generated from the active controls, for example: “Prioritise Eastbourne; include strong nearby stories; publish high-confidence stories automatically.”
- **Four control areas:** Coverage, Voice & presentation, Automation, and Distribution, each with a short current-state summary and one clear action.

No generic “all systems operational” card, vanity score or decorative analytics. If nothing needs attention, the interface should become quieter.

## Proposed structure

### 1. Editorial control

This becomes the central policy area, with three distinct but connected panels:

- **Coverage — what belongs**
  - Move **News values** here.
  - Lead with the “How local?” dial and its plain-English outcome.
  - Keep nearby places and big-story exceptions directly beneath it, progressively disclosed.
  - Bring keywords, landmarks, organisations, postcodes and exclusions into the same coverage model instead of hiding them in “Keywords & Discovery”.
  - Show one short summary on the overview, such as “Balanced · 14 nearby places · big stories allowed”.
  - Put landmark descriptions and reference photos in a place-detail view, not in the main settings flow.
  - Add an **Explain this decision** view on sampled or queued stories, showing the recognised place, strength signal and rule that caused Publish or Review. This makes the dial trustworthy rather than magical.

- **Voice & presentation — how stories feel**
  - Audience, tone, writing style, house-style guidance, examples and illustration style.
  - Show the current choices as a readable summary before opening the full controls.
  - Add a short live writing preview using an existing story headline and paragraph so changes are understandable before they affect future stories.
  - Keep “Community Voice” separate and rename it to describe what it actually does, such as **Community signals**, because it monitors Reddit rather than defining writing tone.

- **Automation — what Curatr may do alone**
  - Show one clear current state: Manual, Assisted, or Automatic.
  - Reveal gathering frequency, story threshold, illustration threshold and drip publishing only when relevant.
  - Put a concise consequence beside every mode: what is gathered, what waits for review and what can publish unattended.
  - Keep automation visually distinct within Editorial control because it has greater publishing consequences than voice choices.
  - Before a consequential change, show its estimated impact using recent arrivals: “This would have published 18 more stories in the last 30 days.” Do not require confirmation for harmless tuning, but confirm changes that begin unattended publishing.

The three panels belong under one **Editorial control** heading, but they should not become one undifferentiated form. Coverage defines judgement, Voice defines treatment, and Automation defines authority.

### 2. Distribution

Group all reader-facing destinations together:

- Public feed status
- Email
- RSS
- Widget
- Daily and weekly audio
- Donations/revenue

The overview shows active channels as compact status rows with audience or delivery health where useful. Detailed controls appear only after opening a channel. Subscriber management moves next to Email rather than living under “More”.

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
- Give every detail view a stable title, summary and direct URL so an owner can return to it or share it with support.
- Use progressive disclosure for specialist controls, especially place reference photos, sentiment terms, channel analytics and scheduling thresholds.
- Standardise autosave: changes save quietly, one small persistent status communicates **Saving**, **Saved**, or **Not saved**. Remove success toasts for routine setting changes; retain clear error messages.
- Keep a lightweight recent-changes trail for consequential controls, with **Undo** immediately after a change. This is especially important for locality and automatic publishing.
- Show consequences rather than implementation language. Replace terms such as “Auto-Simplify”, “scrape frequency” and ambiguous percentages with reader-facing outcomes.
- Preserve the News values live sample, but make it visual: **Publishes automatically / Waits for review**, with Home / Nearby / No recognised place beneath it.
- Use progressive precision: begin with a few opinionated presets—**Hands-on**, **Balanced**, **Hands-off**—then let owners refine individual controls. A custom state is labelled clearly and never reset silently.
- Separate recommendations from settings. Curatr may suggest “Add Hailsham as nearby” or “Your review queue is growing”, but nothing changes until the owner accepts it.
- Keep all controls touch-friendly. On mobile, summaries stack, full panels become single-column sheets or inline sections, long lists use compact rows, and fixed-width selectors are removed.
- Preserve every existing capability and value; this is an information-architecture and interaction redesign, not a reset of settings.

## Visual and mobile standard

- Use the home page’s visual language translated onto a light editorial workspace: familiar accent colour, crisp neutral surfaces, restrained borders and minimal shadow.
- Prefer strong spacing, clear labels, compact status indicators and simple data bars over extra cards.
- Desktop may use a two-column overview, but every detailed editing view remains a readable single column.
- Mobile leads with status and “Needs your attention”, then the four summaries. Editing happens in full-width views with a sticky title and save state.
- Do not shrink the desktop dashboard onto a phone. Replace dense comparisons with stacked outcomes and keep one primary action visible at a time.
- Motion is limited to state transitions, expanding detail and changed-result feedback, and respects reduced-motion preferences.

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
- Verify every displayed explanation against the actual decision returned by the shared scoring rules; never recreate decision logic only for the interface.
- Test at desktop and phone widths, including long place names, many landmarks, failed saves and slow saves.
- Check keyboard navigation, focus order, labels, contrast and screen-reader announcements.
- Confirm routine saves no longer generate repeated success toasts, while failures remain unmistakable.
- Test presets, customisation, impact previews and Undo without changing existing feeds unexpectedly.
- Validate the overview with three real states: healthy automation, a manual feed with a review queue, and a feed with a failed channel.

## Scope boundary

This pass reorganises and simplifies feed settings. It does not change scoring formulas, automation behaviour, publishing rules or the public feed design.
