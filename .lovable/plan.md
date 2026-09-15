# Widget source control: pick sources and a featured strip

Give whoever embeds a widget control over which publications appear in it, plus a small "Featured" section at the top fed by sources they nominate. Settings live in the embed code, so the same feed can look different on different sites. Pinning individual stories comes later as a second step.

## What the widget owner gets

In the widget builder (both the dashboard version and the public one):

- A **Sources** section listing the publications that have recently appeared in the chosen feed, each with a checkbox. All ticked by default; unticked sources never appear.
- A **Featured from** choice: tick any of the included sources to mark them as featured.
- The live preview updates as choices change, so the effect is visible before copying the code.
- The embed code gains two extra attributes. Existing embeds without them behave exactly as today.

Example embed line:

```text
<div id="curatr-widget" data-feed="eastbourne"
     data-sources="Sussex Express,The Argus,BBC"
     data-featured="Sussex Express"></div>
```

## How the list is built

```text
Featured   up to 3 newest stories from the featured sources
Latest     everything else, newest first, filling the remaining slots
```

- No weighting. Each section is strictly newest-first.
- Featured stories are capped at 3 and never repeat in the section below.
- If no featured sources are set, the widget shows a single newest-first list exactly as it does today.
- If the source filter would leave the widget empty, it falls back to the unfiltered feed rather than showing nothing.
- The featured group carries a small "Featured" label above it; when the widget has only featured stories the label is dropped.

## Technical details

**`supabase/functions/widget-feed-data/index.ts`**
- Accept optional `sources` and `featured` query parameters: comma-separated publication names. Validate, trim, cap total length, and ignore empty entries.
- Raise the internal fetch limit when a filter is present (currently `maxStories * 3`) so filtering still yields enough stories.
- After building `formattedStories`: drop stories whose `source_name` is not in the allow-list (case-insensitive, trimmed); split the remainder into featured (source in `featured`) and the rest; take up to 3 featured newest-first, then fill to `maxStories` from the rest newest-first.
- Return the stories in final display order with a `featured: true` flag on the featured ones, so the widget can render the label without re-deriving the split.
- Add a `mode=sources` branch returning the distinct `source_name` values across the most recent ~60 published stories for the feed, with counts. Public and cached like the feed response; exposes nothing that isn't already public.

**`public/widget.js`** (version bump to 1.5.0)
- Read `container.dataset.sources` and `container.dataset.featured`, sanitise both, and pass them to the feed request.
- Include them in the cache key so different embeds don't share cached payloads.
- Render a "Featured" label above the leading run of stories flagged `featured`, in both compact and wide layouts.

**`src/pages/dashboard/Widgets.tsx` and `src/pages/PublicWidgetBuilder.tsx`**
- Extend the config type with `sources: string[]` and `featuredSources: string[]`, plus the loaded list of available source names.
- Fetch available sources via the new `mode=sources` call whenever the selected feed changes.
- Render the include checkboxes and the featured checkboxes, following the existing card patterns in those files. Unticking a source also clears it from featured.
- Append `data-sources` only when not all sources are included, and `data-featured` only when at least one is chosen.
- Pass the same values into the preview fetch so the preview matches the embed.

No database changes are needed for this step.

## Phase 2 (not built now): featured individual stories

Pin specific stories to the top for a fixed window (24 or 48 hours). That needs stored state rather than embed attributes — a `featured_until` timestamp on stories or a small `story_features` table, a pin control in the published stories list, and the widget feed hoisting unexpired pins above the source-based featured group. Planned separately once source control is in use.
