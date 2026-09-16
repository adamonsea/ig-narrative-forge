# A quieter, more delightful editorial workspace

## Direction

Evolve the authenticated product into a **quiet editorial workspace**: light, precise and efficient, with restrained flashes of Curatr’s mint and violet brand colours. Use **Instrument Serif** for one strong editorial heading per view and **Work Sans** for controls, data and body copy.

The workspace should feel like opening an editor’s well-organised desk: the next decision is obvious, routine machinery stays quiet, and specialist controls appear only when requested.

This is a dashboard and settings redesign. It will preserve feed behaviour, scoring, automation, publishing, permissions and existing URLs.

## What the audit found

- The public site has a distinctive editorial identity, while the signed-in product mostly uses generic component styling with isolated hardcoded purple and green accents.
- The topic workspace has three top-level tabs, while Settings introduces another hub of six destinations. Moving between overview cards and detail pages creates more navigation and repeated headings than necessary.
- Several detail areas repeat their section name inside a parent heading. News values is currently both a section heading and a titled card; Identity also wraps a second “Topic Branding” card title.
- Settings mix multiple framing styles: bordered cards, bordered rows, accordions, dividers and nested panels. This makes every item appear equally important.
- Rare controls are technically grouped, but enabled and disabled specialist features can still expose substantial detail rather than staying as compact summaries.
- Publishing state appears in the topic header, topic cards and Distribution with different interactions. This weakens confidence about which control is authoritative.
- The topics page presents many metrics with similar visual weight, but does not prioritise feeds that need attention.
- Naming remains inconsistent across Dashboard, Topics, Feed and Pipeline, requiring users to remember which term means the workspace, public output or editorial queue.
- Routine saving is not fully consistent: some areas show quiet save state, while others still use success notifications.

## New workspace structure

### 1. Keep the global sidebar simple

Retain the collapsible global sidebar for switching between the account’s feeds and product-level destinations. Refine its typography, active state and spacing, but do not add more permanent navigation.

Within an individual feed, replace the current Settings overview-card detour with a **focused section sidebar**:

```text
Eastbourne
├─ Pipeline
├─ Insights
└─ Editorial control
   ├─ Overview
   ├─ Coverage
   ├─ Voice & pictures
   ├─ Automation
   ├─ Distribution
   ├─ Identity
   └─ Optional features
```

- Desktop: a narrow, sticky section rail beside one readable content canvas.
- Mobile: the rail becomes a compact section picker; the content remains one column.
- Preserve `?tab=` and `?section=` links so alerts and support links continue to open the exact destination.
- Keep the rail collapsible or replace it with the section picker at constrained widths; it must never trap content in a narrow column.

### 2. Make Overview a briefing, not a menu

The Editorial control overview becomes a compact status briefing:

- Lead with genuine exceptions and incomplete setup only.
- Show a short human-readable editorial policy summary.
- Reduce pipeline figures to a single connected flow strip with one route to Pipeline.
- Show each control area as a concise text row with current state and an arrow, not six large equal-weight cards.
- When nothing needs attention, allow the page to become visibly quieter instead of filling the space with reassurance.

### 3. Use progressive disclosure consistently

Every detailed section follows the same hierarchy:

1. Section title and one useful sentence.
2. Current outcome in plain English.
3. The few controls used regularly.
4. “Advanced” or “Review details” for rare controls.

Apply this model as follows:

- **Coverage:** lead with “How local?” and its real-world consequence. Collapse neighbouring-place detail, terms and exclusions into summaries unless they need attention or the owner opens them. Keep intelligent suggestions visible before the full term lists.
- **Voice & pictures:** show audience, tone and writing style as compact, visual choices. Place house-style notes, examples and completed picture references behind summaries. Pending place confirmations remain visible.
- **Automation:** show Hands-on, Assisted and Automatic as the primary decision. Reveal the five technical modes and thresholds only under “Fine-tune”. Keep the current-behaviour sentence and next-run information visible.
- **Distribution:** show channels as quiet rows. A disabled channel remains one row; an enabled channel reveals its useful status and one action, with full management opened deliberately.
- **Identity:** show a small live brand preview first. Put logo, app icon, colour and welcome content into focused editors without an additional nested “Topic Branding” card.
- **Optional features:** disabled features remain one-line choices with a short benefit. Only enabled features expose configuration.

## Remove label noise

- Use one visible heading for each section; child components must not repeat the parent title.
- Remove eyebrow labels when the main heading already communicates the same idea.
- Replace implementation terms such as “Scrape frequency”, “Auto-Simplify” and “Illustration threshold” in the primary view with outcome language; retain precise controls inside Fine-tune.
- Keep labels next to controls; remove helper copy that merely restates the label.
- Use counts as secondary metadata beside the relevant name, not as detached badges above content.
- Standardise the product vocabulary:
  - **Feeds** are the owner’s publications.
  - **Pipeline** is where stories move from arrival to publication.
  - **Editorial control** is where selection, voice and automation are governed.
  - **Dashboard** is the account-level overview, not another name for the feed list.

## Visual system

### Colour

Use the selected balanced brand palette through semantic tokens:

- White and a very pale cool-green neutral for the main workspace.
- Dark ink for primary text and navigation.
- Mint for healthy activity, completed setup and primary positive actions.
- Violet for selection, navigation and creative/AI-assisted moments.
- Existing warning and error colours remain semantic and accessible.

Neither accent should wash across whole sections. Colour appears in active indicators, slim rules, icons, focus rings, selected controls and small moments of feedback. Remove hardcoded dashboard colour values and route these roles through the shared tokens, including dark mode.

### Typography

- Add **Instrument Serif** for page and section display headings only.
- Use **Work Sans** for all controls, labels, data, tables and body copy.
- Use at most one prominent serif heading per view; detailed forms remain highly legible and sans-serif led.
- Remove overly small uppercase labels as a default hierarchy device. Use sentence case, weight and spacing instead.
- Keep letter spacing neutral.

### Surfaces and rhythm

- Reduce card dependence. Use unframed sections, grouped rows and hairline dividers for page structure.
- Reserve cards for repeated feed items, genuine previews and bounded interactive tools.
- Use one small radius system and restrained shadows; no nested cards.
- Create stronger vertical rhythm between decisions while reducing empty space inside simple rows.
- Add stable control dimensions so toggles, save states and changing counts do not shift the page.

### Delight

- Add subtle 150–200ms transitions for section changes, disclosure and save completion, with reduced-motion support.
- Let active navigation use a slim violet marker and a soft neutral surface.
- Use mint confirmation sparingly when a setup task becomes complete.
- Give empty states and completed states concise, human copy rather than decorative panels.
- Do not bring the home page’s dark canvas, glows or large marketing animation into the work surface.

## Dashboard and feed list

- Restyle the account dashboard with the same typography and semantic accents.
- Reduce each feed card to the information needed for triage: feed identity, live/private state, one primary audience signal and anything requiring attention.
- Move secondary analytics behind an “Insights” action rather than showing every number at equal weight.
- Surface genuine attention states on the feed card so an owner knows where to act before opening it.
- Use the shared confirmation experience for publishing state; remove the native confirmation dialog and avoid presenting a third read-only version of the same control.
- Keep “Create feed” as the clear account-level action and use the shared button treatment.

## Save and feedback behaviour

- Standardise one quiet, persistent save indicator per editing surface: **Saving**, **Saved**, or **Not saved**.
- Remove routine success notifications. Keep notifications for errors, destructive actions with Undo, and meaningful background completion.
- Do not auto-open advanced settings after a routine change.
- Preserve existing rollback and confirmation protection for consequential publishing changes.

## Technical implementation

- Introduce the selected font pair through the document font links, then update the Tailwind font families and shared typography classes.
- Consolidate dashboard colour, surface, status, focus and motion roles in the global semantic tokens; replace raw colour utilities in the affected dashboard components.
- Refactor `EditorialControlCenter` into a responsive section-navigation shell plus small overview/detail components.
- Remove duplicate headings and nested card wrappers from child settings panels so parent sections own their hierarchy.
- Add reusable primitives for section headers, summary rows, disclosure groups and save status rather than styling each settings panel independently.
- Keep the existing global sidebar, query parameters, owner/admin checks and data calls intact.
- Make no database or business-rule changes.

## Verification

- Test the account dashboard, Pipeline, Insights and every Editorial control section at desktop and phone widths.
- Verify long feed names, long place names, many picture references and empty states do not overflow.
- Confirm every direct `?tab=` and `?section=` link still opens the correct content and attention links land on the right control.
- Confirm all existing settings retain their values and save exactly once per user change.
- Verify Holiday mode and every existing automation mode remain unchanged.
- Check keyboard navigation, visible focus, contrast, touch targets and screen-reader labels to WCAG 2.1 AA.
- Verify both light and dark themes, with accents maintaining readable contrast.
- Confirm routine saves no longer produce success notifications and failures remain unmistakable.

## Scope boundary

This pass changes dashboard presentation, information hierarchy, wording and disclosure only. It does not change gathering, scoring, writing, illustration generation, automation, publishing, subscriptions, analytics calculations or access control.
