# Fix the locality gate that is holding clearly-local Eastbourne stories

## Correction first
My earlier "100% scores are being blocked by the gate" was right about the *symptom* (the 09:20 logs show 14/14 articles held, 0 queued), but my explanation was a guess. The titles plainly contain "Eastbourne", the topic's `region` is `Eastbourne`, and running the gate function from source against the real data returns **pass**. So the live function is diverging from the source — I will prove the exact cause with logging rather than assert it.

## Why this is happening (hypothesis to confirm)
In `auto-simplify-queue/index.ts` the article's `title`/`body` are fetched into `sharedContent`, then passed to `passesLocalityGate`. If `sharedContent` is empty/undefined at the moment the gate runs (e.g. variable scoping in the deployed build), the gate sees no title and no body, finds no anchor, and holds **every** article regardless of score. That matches the logs exactly: all held, none queued.

## Steps

### 1. Instrument the gate (temporary, high-signal logging)
In `auto-simplify-queue/index.ts`, when the gate holds an article, log the real evidence:
- whether `sharedContent` was null,
- the resolved anchor count,
- the matched anchor (on pass) or a short title snippet (on hold).

This turns the next run into ground truth instead of speculation.

### 2. Make the gate correct and robust
- Ensure `title` + opening body are always available to `passesLocalityGate` (hoist/guarantee `sharedContent`), and widen the body window from 500 to ~1200 chars after stripping boilerplate ("Sign In Subscribe", bylines, "Published … BST").
- Always include the topic `region` as a first-class anchor.
- Add a **fail-open safety valve**: if an article is at/above the quality threshold AND the `region` string appears anywhere in title or body, it passes the gate. A 100%-scoring story that literally says "Eastbourne" must never be held.

### 3. Redeploy and re-run
Trigger `auto-simplify-queue`, then read its edge logs to confirm: the Eastbourne-titled stories now queue, and only genuinely off-region items (e.g. "First-ever Brighton Queer Prom") are held. The held backlog is still `processing_status = 'new'`, so it recovers automatically — no data migration needed.

### 4. Remove the temporary verbose logging
Once confirmed, trim the diagnostic logging back to a concise per-run summary.

## Scope / safety
- Changes are confined to `supabase/functions/auto-simplify-queue/index.ts`. No schema, RLS, or frontend changes.
- The gate stays in place for genuinely off-region content (the River Meon / South Downs class of false-positive) — we are only fixing the false-negatives where a clear local anchor is present.
- I'll update the Internal Appendix gate note to record that `region` is an always-on anchor plus the at-threshold fail-open rule.
