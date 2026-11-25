# Phase 0 — Free-tier ceiling and credits for automatic work

## What's true today
- `story-illustrator` line 644: `isSuperAdmin = isServiceRole`, so every automatic picture skips credits.
- `animate-illustration` only charges a signed-in user. Unlike pictures, it has no service-role path.
- `enhanced-content-generator`, `suggest-content-sources`, `suggest-feed-setup` and `scrape-whats-on` event copy never call `reserve_user_credits`.
- `charge-studio-action` already handles reserve, settle and release correctly. We'll reuse that pattern.

## Numbers that challenge the allowances (last 30 days)
| Feed (all yours) | Stories | AI pictures | Busiest day |
|---|---|---|---|
| Eastbourne | 593 | 567 | 37 |
| Brighton List | 45 | 41 | 12 |
| Original Gravity Dispatch | 21 | 21 | 21 |

1. **Stories: 1,500/month is fine.** Your account used 659.
2. **Credits: 500/month is far too low for an Autopilot feed that draws pictures.** Eastbourne alone drew 567 pictures. Even at the cheapest 2 credits each that's ~1,130 credits a month, so Eastbourne would stop drawing new pictures around day 13. Options:
   - (a) Count automatic pictures in Autopilot at 1 credit each.
   - (b) Raise the Pro allowance to ~1,500 credits.
   - (c) Accept that pictures fall back to source photos mid-month. I recommend (a) or (b) and will show shadow-mode figures before you decide.
3. **Daily cap:** Pro 100/day covers the busiest Eastbourne day (37 pictures, about 74 credits). Free 20/day is fine.
4. **The usage log can't split spend by account yet.** `api_usage` has no user or feed column. It also shows only $7.21 of OpenAI spend in 30 days, which can't include 629 pictures, so picture calls aren't being logged. The admin free-vs-Pro split needs step 1 below before it means anything.

## Telling system calls from user calls
One shared helper, `_shared/billingActor.ts`, returns `{ payerId, actor: 'user' | 'system', bypass }`:
- **User call:** a valid user token. The payer is that user, and `bypass` applies only if `user_roles` says superadmin.
- **System call:** the service-role key or the cron token. The payer is always the feed owner (`topics.created_by`, found from the topic, story or article). `bypass` is never true for system calls, which fixes the `isSuperAdmin = isServiceRole` bug.
- No owner found means the call is refused and logged. It never runs for free.
- **Superadmin-owned feeds** (yours): still metered and still logged, but never paused. A per-account `billing_exempt` flag is set only on your account, and the meter keeps counting so you can see the real cost.

## Build
1. **Ledger and metering (one module, `_shared/allowance.ts`)**
   - `reserveCredits` / `settle` / `release` wrap the existing RPCs.
   - `countStory(owner, topic)` counts a story against the story allowance (no credits).
   - `canRunAutomation(owner)` checks the trial, story count, credits, daily cap and the global free pause.
   - Add `user_id` and `topic_id` to `api_usage`, plus a `usage_events` row per AI action (owner, feed, kind, credits, story count, shadow flag).
2. **Functions touched**
   - `story-illustrator`: remove the service-role bypass; charge the owner.
   - `animate-illustration`: add the system path; charge the owner.
   - `enhanced-content-generator` (called from `queue-processor`): `countStory` after a successful rewrite.
   - `suggest-content-sources`, `suggest-feed-setup`: reserve a small credit cost (proposed 1 each).
   - `scrape-whats-on` event copy and captions: charge the owner (already 1/event for captions; extend to event copy).
   - Gate checks (skip, don't fail) in `automated-scheduler`, `queue-processor`, `auto-illustrate-stories`, `drip-feed-scheduler`, `illustration-batch-poller` and `scrape-whats-on`. A skipped feed records the pause reason once and resumes on its own when allowance returns.
   - `check-subscription`: give the welcome allowance only after email verification, once per normalised email (lower-cased, Gmail dots and +tags removed, stored as a hash in `credit_grants`).
3. **Free trial:** 30 published stories or 14 days, plus 20 credits; one draft feed per free account. When it runs out, gathering, rewriting and pictures pause. Feeds and stories stay.
4. **Pro:** 1,500 stories/month and 500 credits. When credits run out, stories keep publishing with credited source photos and only new AI pictures pause. Daily cap of 100, which the owner can raise.
5. **Extra usage (Pro):** off by default. The owner can turn on auto top-up (500 for $10) with a monthly spend cap they set. It never goes past the cap.
6. **Desk:** a quiet amber line, "Paused — out of credits", with one button (Upgrade or Top up). Nothing else on the Desk changes.
7. **Usage page (Settings → Usage):** a stories bar, a credits bar, the reset date and a per-feed breakdown. Alerts at 75/90/100% by email and on the Desk, sent once per threshold per period.
8. **Admin:** daily spend split free vs Pro from `api_usage` (after the new columns), an alert if any account passes $5/day, and one switch: "Pause all free-account automation" (a `feature_flags` row read by `canRunAutomation`).
9. **Pro-only at publish:** public feed, widgets, RSS, reader MCP, API tokens, handle change, custom domain, email briefings and social automation. Free feeds get an auto handle and one private preview link (noindex, "Preview" label, expires with the trial). Existing Pro feeds are unaffected.

## Rollout
1. **Shadow mode, 7 days.** The `BILLING_ENFORCE` flag is off. Every path writes `usage_events` with `shadow=true` and charges nothing. You get a summary per account and feed (projected stories, credits, pause day).
2. **Check before switching on.** Your feeds and current Pro feeds go through the projection. Your account is `billing_exempt`; any Pro feed projected to pause gets flagged to you before the switch.
3. **Test account.** Use a real inbox you provide (we never make up test addresses). Confirm the allowance is granted once (a second signup with a dotted or +tag variant gets nothing), the feed pauses at zero, and no new AI calls appear after.
4. **Enforcement on** only after your OK. Nothing gets published.

## Open questions
- Picture cost in Autopilot: (a) 1 credit, (b) a bigger Pro allowance, or (c) photo fallback mid-month?
- Credit price for suggestions (proposed 1)?
- A real inbox for the fresh free-account test.
