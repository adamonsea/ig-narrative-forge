## Locality gatekeeper for automated stories

### Problem
Holiday mode (and auto_simplify) decide what to auto-process purely on **quality score ≥ threshold + keyword/negative-keyword checks**. There is no requirement that a story actually mentions the topic's locality. So a "River Meon / South Downs" article matched broad terms ("community", "south downs"), scored ≥75, and auto-published into the Eastbourne feed even though it never references Eastbourne or any Eastbourne-specific place. The South Downs spans a huge area, so broad keyword matching isn't enough for a local news feed.

### Solution
Add a **locality gate** inside `supabase/functions/auto-simplify-queue/index.ts` — the function that actually decides what gets queued. For **regional** topics only, an article must contain at least one *strong local anchor* in its **title or opening (~first 500 chars)** before it can be auto-queued. Generic keywords no longer qualify a story for automation on their own.

This is universal/multi-tenant: it reads each topic's own configured anchors, no hardcoded place names.

### Decisions (confirmed)
- **Strictness:** anchor must appear in the **title or opening** of the article (not buried deep in the body).
- **Scope:** applies to both **holiday** and **auto_simplify** modes.
- **Fail behavior:** story is **held for manual review** — left as `new` in Arrivals, never auto-discarded.
- **Anchor source:** reuse existing topic fields — `region`, `landmarks`, `postcodes`, `organizations`. No new database field.

### How the gate works
For each candidate article in a **regional** topic:
1. Build the anchor set from the topic: `region` + `landmarks[]` + `postcodes[]` + `organizations[]` (lowercased, blanks removed).
2. Take the article's `title` plus the first ~500 characters of `body` (the "opening").
3. Require at least one anchor to appear (word-boundary match, case-insensitive) in that title+opening text.
4. If no anchor matches → **skip queuing**, leave `processing_status = 'new'` so it stays in Arrivals for manual review, and log the reason.
5. If an anchor matches → continue through the existing quality/negative-keyword/queue checks unchanged.

Keyword (non-regional) topics are unaffected — they have no locality concept and keep their current behavior. Topics with no anchors configured at all are also skipped by the gate (so they don't silently stop auto-flowing) — this is logged so it's visible.

### Behavior changes
- Eastbourne-style topics will stop auto-publishing far-flung South Downs / regional stories that only match broad keywords.
- Those stories still appear in Arrivals for one-click manual approval — nothing is lost or discarded.
- Genuinely local stories (mentioning Eastbourne, a configured landmark, a BN2x postcode, or a named local organisation in the headline/intro) flow automatically as before.

### Technical detail
File: `supabase/functions/auto-simplify-queue/index.ts`
- Extend the topic pre-fetch (currently `default_tone, default_writing_style, audience_expertise, negative_keywords`) to also select `topic_type, region, landmarks, postcodes, organizations`, and store them in `topicDefaultsMap`.
- The per-article `shared_article_content` (title/body) is currently fetched only when negative keywords exist. Fetch it **once per article** and reuse it for both the negative-keyword check and the new locality check (no extra queries in the common path).
- Add a small `passesLocalityGate(title, body, anchors)` helper: lowercases title + `body.slice(0,500)`, returns true if any anchor matches on a word boundary.
- Apply the gate only when `topicDefaultsMap[topic_id].topic_type === 'regional'` and at least one anchor is configured.
- On fail: `console.log` a clear reason (e.g. `🧭 Locality gate: article X held for review — no local anchor in title/opening`) and `continue` without touching `processing_status` (stays `new`).
- Optionally record a lightweight entry in `system_logs` summarising how many articles each run held back for locality, for visibility.

No database migration is required. No reader-facing UI changes. Changes are confined to the automation edge function, preserving negative-keyword filtering, orphan recovery, parliamentary exclusions, and the existing quality gate.
