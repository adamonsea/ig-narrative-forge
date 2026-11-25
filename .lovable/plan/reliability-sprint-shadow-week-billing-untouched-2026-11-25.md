# Reliability sprint (shadow week, billing untouched)

Nothing is published. Every step is checked against live Eastbourne and Lisbon in read-only mode before the next starts.

## What I found already
- 190 background functions; 40 scheduled jobs. Recovery overlaps on schedule: `auto-recover-stuck-stories` (every 5 min), `queue-processor` (every minute, also resets stale jobs), `queue-alert-monitor` (15 min), `daily-content-monitor` (twice: every 4h and every 6h), `source-health-monitor` (daily) plus `proactive-source-monitoring` (6h), `topic-automation-monitor` (hourly) and `universal-topic-automation` (2h).
- Not scheduled (run by hand or dead): `reset-stuck-processing`, `emergency-source-fix`, `emergency-scrape-fix`, `emergency-scrape-test`, `schedule-recovery`, `universal-platform-fix`, `ai-scraper-recovery`, `reactivate-eastbourne-sources` (hard-codes one feed), the `test-*` functions, `phase2-verification`, `clean-slate-migration`, `r`.
- Feed speed numbers are **not measured yet**. That is step 3a, and its results come back before any speed change.

## Order of work
1. Safety net first: smoke test + checklist (step 2)
2. Health check + admin view + Desk line + alert email (step 1)
3. Audit recovery tools and tenant isolation (report only; nothing deleted without your OK)
4. Measure feed speed and report numbers
5. Speed fixes, one at a time, each behind the smoke test

## 1. Know when something breaks
- **Health check** (one hourly job; replaces nothing yet). For each live feed it records: last successful fetch per source, items stuck processing over 30 min, failed rewrites/pictures in the last 24h, events-gather failures, and "no new stories" compared with that feed's own normal gap (median over 14 days, so quiet feeds aren't flagged).
- Result is saved as one row per feed: green / amber / red + one plain reason, e.g. "2 sources stopped working".
- **Admin → Health**: list of every feed, colour dot, reason, time it changed.
- **Desk**: one quiet line only when the owner can fix it ("2 sources stopped working — Fix" opens Sources). Nothing else on the Desk changes.
- **Email to you** when a live feed turns red, once per incident; another email only after it goes green and red again.
- Risk: low. Read-only checks plus a new table; Desk line is hidden unless the feed is amber/red.

## 1b. Recovery tools audit (report, then your call)
Table of every recovery/emergency function: scheduled or not, last run, what it touches, keep / merge / retire. Likely suggestion: merge stuck-item recovery into `queue-processor` + the health check, merge the two content monitors, retire unscheduled emergency/test functions by moving them to `_archived` (reversible). Nothing removed until you approve the list.

## 1c. Tenant isolation check
- Review every scheduled job and shared cache key for a missing feed filter.
- SQL checks with simulated sign-ins for two owners (no new accounts, no emails): each sees only their own stories, stats and settings across all reader/stats functions and the Desk tables.
- Report findings; fix only real leaks, each as its own step.

## 2. Stop changes breaking things
- **Smoke test** (browser script run after each change and on request; Lovable has no deploy hook, so "after every deploy" = I run it before saying any feed/Desk/pipeline change is done). Against Eastbourne Briefing + Lisbon:
  - feed page loads, first 3 cards show headline, picture and source credit
  - swipe to slide 2 and scroll to card 5 work
  - events view loads where switched on
  - widget data and RSS return valid output
  - Desk opens for the owner (when I can sign in as you; otherwise reported as unchecked)
  - Uses a `zztest_` visitor so no reader figures are touched.
- **Pre-change checklist** added to AGENTS.md: core files/flows to re-verify for feed, Desk or pipeline changes, plus "run the smoke test".
- Risk: none to the live feed.

## 3. Smooth reader feed
### 3a. Measure (mid-range phone profile: Moto G-class CPU 4x slower, 4G throttle)
- Time to first card visible (and LCP)
- Swipe: frames per second and long frames during 10 swipes and a 20-card scroll
- Image bytes per card (first 5 cards) and whether off-screen images wait
- JavaScript downloaded for the public feed page
- Real visitors' page speed from site analytics (p75 per page, with counts)
Report all numbers to you before step 3b.

### 3b. Likely fixes (picked from the numbers, biggest first)
| Change | Risk |
|---|---|
| Serve smaller resized pictures per card, lazy-load beyond the first two | Low; check credits and fallbacks still show |
| Load heavy extras (pinned fan, events, quiz, briefings) after the first card | Medium; card positions must stay the same (`feedCardPositions` tests) |
| Stop whole-feed re-renders on each swipe | Medium; slide tracking and stop data must still record |
| Split rarely used code off the feed page | Low |
Targets: first card under 2s on 4G; no long frames while swiping. No design or feature changes.

## Verifying each step
Smoke test before and after; existing tests run; feed screenshots compared; Desk and reader figures unchanged (admin consistency check still matches). Any failure: undo that step only.

## Technical notes
- New table `feed_health` (one row per topic, guarded read for owners via `can_manage_topic`, admin all) and `feed_health_incidents` for once-per-incident email.
- Health job: one hourly schedule, consolidating where monitors overlap rather than adding another poller.
- Email through the existing email sender used for usage alerts.
- Smoke test: Playwright script kept in `scripts/smoke/`.
