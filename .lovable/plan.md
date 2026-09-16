# Tidying the Admin area

## What "Unknown feed" is

The picture-cost table groups spending by feed. 695 of the last 1,000 picture records belong to feed `8b0321a7…`, which no longer exists — it was deleted, but its 1,390 cost records stayed behind. So the table shows real spending that can no longer be named.

Fix: label those rows "Deleted feed" instead of "Unknown feed", so it reads as history rather than a bug. No records are deleted — the spend total stays accurate.

## What's in Admin today, and what happens to it

Verified against live data before deciding.

**Keep as is**
- Content queue (pipeline control, actively used)
- Source health (still on a nightly schedule, 24 checks in the last two weeks)
- Picture cost & speed (4 models recorded in the last 7 days — this is the live cost view)
- AI assistant add-on entitlements (only place to grant the add-on)

**Keep, but move lower / quieter**
- Waitlist — last signup 6 Aug, nothing since. Still the only place to see and export those 4 signups, so keep it, but collapse it behind a "Waitlist (4)" summary rather than a full open panel.
- Experiments — one test is live (`subscribe_button_label`, running since Feb, 234 events in 30 days) and has no end date. Keep the panel, and add a plain "Running since…" line so it's obvious it's still collecting. Deciding a winner and closing it is a separate call for you, not this plan.

**Retire**
- Image model bench (`/admin/image-bench`) — built purely to pick a replacement for the retiring GPT Image 1.5. That decision is made and shipped (GPT Image 2 is in use). Remove the page, the route, and its edge function. Its 22 saved comparisons are kept in the database, not shown.
- "Remove legacy orphaned" source button — a one-time migration cleanup. There are currently 0 orphaned legacy sources. Remove that one button; keep the ordinary "Clean orphaned sources" housekeeping action.
- Story lifecycle audit — a backfill checker. Simplification is fully clean (0 missing). Illustration shows 1,115 published stories without a generated picture, but those are mostly older stories that were never meant to have one, so the number isn't actionable as a health check. Remove the panel; if you want illustration coverage visible, it belongs next to the picture cost figures, not as a separate audit.

**Reconnect**
- AI cost dashboard (`/admin/ai-costs`) — a working, live-data page that nothing links to. Add a link to it from the Admin page so it's reachable without typing the URL.

## Result

Admin becomes: Operations (queue, source health, costs incl. a link to the full cost dashboard), Add-on access, and two quiet collapsed panels (Experiments, Waitlist). Three retired items disappear.

## Technical notes

- `ImageGenerationMetricsPanel.tsx`: rename the unresolved-topic fallback to "Deleted feed".
- Delete `src/pages/ImageModelBench.tsx`, its route in `src/App.tsx`, and `supabase/functions/image-model-bench`. Leave `image_bench_results` table intact.
- `SourceCleanup.tsx`: drop the `cleanup_orphaned_legacy_sources` action only.
- Delete `src/components/LifecycleAudit.tsx` and its use in `AdminPanel.tsx` (also removes ~8 full-table count queries per admin page load).
- `AdminPanel.tsx`: regroup sections, wrap Waitlist and Experiments in the shared `Disclosure` primitive, add a link to `/admin/ai-costs`.
- No database migrations, no changes to publishing, scoring, gathering or any feed-owner-facing surface.

## Needs your decision (not included above)

- Close the `subscribe_button_label` experiment and pick a winner? Leaving it open is fine; just flagging that it has run for seven months.
