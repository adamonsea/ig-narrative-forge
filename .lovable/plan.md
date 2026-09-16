# A quieter "look back" tab

## What changes

- **Rename the tab** from "Insights" to **"Reviews"** — the tab's real job is generating and keeping shareable period round-ups ("State of the area"), not analytics.
- **Move it to the right end of the tab nav**, visually de-emphasised, so the main reading is: Pipeline → Editorial control … and, off to the right, Reviews. It stays a tab because it's used a few times a year and doesn't fit the other surfaces.
- **Move Categories into Editorial control** as a "Coverage categories" section. It's taxonomy configuration (which categories exist, auto-classification settings), not publishing — it belongs with the other editorial policy controls, behind progressive disclosure. Keep its existing URL reachable via `?tab=settings&section=coverage-categories`.
- **Reviews tab keeps only Period reviews**, improved slightly: a short intro line explaining these are public look-backs of everything published in a period, the existing generate/delete flow unchanged. Existing reviews and their public URLs are untouched.

## What does not change

- The `generate-period-review` edge function, `topic_period_reviews` table, category classification functions, and all data models — no migrations.
- Review public slugs/URLs — nothing readers see breaks.
- Pipeline, the live insight strip, scoring, automation, publishing.

## Technical details

- `src/pages/TopicDashboard.tsx`: tabs reordered/restyled — Pipeline, Editorial control on the left; Reviews pushed right (e.g. `ml-auto` on its trigger) with muted styling; `?tab=insights` redirects to `?tab=reviews` for old links; insights tab content now renders only `PeriodReviewPanel`.
- `src/components/topics/EditorialControlCenter.tsx`: new `coverage-categories` section rendering `CategoriesPanel`, added to the sections list and attention/anchor handling.
- `src/components/categories/PeriodReviewPanel.tsx`: light copy edit (explainer line behind InfoHint per house style); heading "Look back over a period".
- Update the "Insights" link in `src/components/topics/TopicManager.tsx` (card button) to point at the Reviews tab.
- Verify `?tab=` deep links, keyboard focus, mobile layout, and that no other code references the "Insights" label.
