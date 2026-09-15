# Widget source control: pick and weight sources

Give whoever embeds a widget control over which publications appear in it, and how strongly each one is favoured. Settings live in the embed code, so the same feed can look different on different sites. Featuring individual stories comes later as a second step.

## What the widget owner gets

In the widget builder (both the dashboard version and the public one):

- A **Sources** section listing the publications that have recently appeared in the chosen feed, each with a checkbox. All ticked by default.
- For each ticked source, a small priority control: **Normal**, **Favoured**, **Top priority**.
- The live preview updates as choices change, so the effect is visible before copying the code.
- The embed code gains a single extra attribute carrying the choices. Existing embeds without it behave exactly as today.

Example embed line:

```text
<div id="curatr-widget" data-feed="eastbourne" data-sources="Sussex Express:3,The Argus:1,BBC:2"></div>
```

## How the ordering works

Stories are still drawn from the feed newest-first, but each one gets a score combining its age and its source priority. Top priority stories from a favoured publication rise above older stories from a normal one; within the same priority, newest still wins. Sources left unticked are dropped entirely. If the filter would leave the widget empty, it falls back to the unfiltered feed rather than showing nothing.

## Technical details

**`supabase/functions/widget-feed-data/index.ts`**
- Accept an optional `sources` query parameter: comma-separated `name:weight` pairs, weight 1-3. Validate and cap length; ignore malformed entries.
- Raise the internal fetch limit when a filter is present (currently `maxStories * 3`) so filtering still yields enough stories.
- After building `formattedStories`, when a filter is present: drop stories whose `source_name` is not in the allow-list (case-insensitive, trimmed), then sort by `score = weight * 1000 - ageInHours`, then slice to `maxStories`. Empty result after filtering falls back to the unfiltered list.
- Add a `mode=sources` branch: returns the distinct `source_name` values across the most recent ~60 published stories for the feed, with counts. Public and cached the same way as the feed response. This powers the builder's source list without exposing anything not already public.

**`public/widget.js`** (version bump to 1.5.0)
- Read `container.dataset.sources`, sanitise it (strip anything outside name/weight shape), and pass it through to the feed request.
- Include the sources string in the cache key so different embeds don't share cached payloads.

**`src/pages/dashboard/Widgets.tsx` and `src/pages/PublicWidgetBuilder.tsx`**
- Extend the config type with `sources: Record<string, number>` plus a loaded list of available source names.
- Fetch the available sources via the new `mode=sources` call whenever the selected feed changes.
- Render the checkbox + priority list, following the existing card and `Select` patterns in those files.
- Append `data-sources="..."` to the embed code only when the selection differs from "all sources, normal priority".
- Pass the same string into the preview fetch so the preview matches the embed.

No database changes are needed for this step.

## Phase 2 (not built now): featured stories

Pin chosen stories to the top of the widget for a fixed window (24 or 48 hours). That needs stored state rather than embed attributes — a `featured_until` timestamp on stories or a small `story_features` table, a pin control in the published stories list, and the widget feed hoisting unexpired pins above the scored ordering. Planned separately once source control is in use.
