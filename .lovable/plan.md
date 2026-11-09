# "Both" sends one confirmation email (+ last-slide domain rule)

## Item 1 (small, built alongside)
In `src/lib/lastSlide.ts`, a last-slide sentence "Read the full story/article at {domain}" is hidden only when {domain} matches this story's own source/publisher domain (compared without `www.`, case-insensitive, subdomains of the same site count). A different site is kept. Appeal protection still applies; "recognise/recognize" widening kept; "find" unchanged. Tests for match, mismatch, `www.` and appeal cases; re-count of the 12 known cases.

## Item 2: how "Both" will work

**Today:** the card calls `secure-newsletter-signup` twice (daily, then weekly). Each call makes its own row with its own confirmation code and sends its own email, so "Both" sends two emails.

**New:** the card makes one call with `notificationType: 'both'`. The service creates or refreshes the daily and weekly rows, gives both pending rows the **same** confirmation code, and sends **one** email ("Confirm your daily and weekly {feed} briefings"). Tapping the link confirms every row carrying that code.

### What changes
- `secure-newsletter-signup`: accepts `'both'` (in addition to `'daily'`/`'weekly'`, which behave exactly as now). Rate limit counted once per request.
- `send-confirmation-email`: accepts `'both'` for subject/body wording only. Same link format: `/verify-subscription?token=...`.
- `verify-subscription`: finds rows by code with a list query instead of "exactly one row", and confirms all unconfirmed rows with that code. With one row (every link already in inboxes) the result is identical to today.
- `InlineEmailSignupCard.tsx`: one call for "Both" instead of two; same toasts.
- **Database: no changes.** The confirmation-code column is already non-unique, and each row keeps its own unsubscribe code.

### Existing rows when someone picks Both
- Daily already confirmed, weekly missing: create weekly only, email confirms just weekly ("You're already getting daily; confirm weekly").
- Daily pending (never confirmed): its code is replaced with the shared one, so one link confirms both. The old daily link stops working, same as today's "resend" behaviour.
- Both already confirmed: no email, "Already subscribed" message, as now.
- Unsubscribed earlier (inactive but confirmed): unchanged from today's single-briefing behaviour; I won't alter reactivation rules in this change.

### Unsubscribe
Untouched. Every row keeps its own unsubscribe code, so the daily email's link stops only daily, and the weekly email's link stops only weekly.

### Subscriber counts
Still one row per briefing; curator counts work exactly as now (Both = 1 daily + 1 weekly, matching the existing 21/21 model).

## Test plan (no fake addresses)
1. Rolled-back database checks: inside a transaction, insert two pending rows sharing a code, run the same "confirm by code" update, check both become active/confirmed with distinct unsubscribe codes, check a lone-code row confirms the same as today, then roll back and confirm active count is unchanged (63).
2. Re-read the `verify-subscription` change against one already-sent single link (look up a real pending row's shape only, no call).
3. **Adam's real test in the preview**, with his own email:
   - Open the Eastbourne feed in the preview, scroll past story 3 to the sign-up card.
   - Tap **Both**, type his email, tap the button.
   - Expect: **one** email, subject "Confirm your daily and weekly Eastbourne briefings".
   - Tap **Confirm** in it. Expect the "You're subscribed" page.
   - I then confirm by SQL that both his rows are active.
   - Next daily email: tap its Unsubscribe; I confirm only daily went inactive, weekly still active. (Optional, and he can re-subscribe after.)

## Rollback
The confirm change is backward compatible, so the fast revert is the card only: switch "Both" back to two separate calls (one-line change, republish) — the old two-email flow works with the new services. If the confirm step itself misbehaves, redeploy the previous `verify-subscription` (kept verbatim in git history); links sent with a shared code would then fail with "invalid link", so affected readers would re-sign up. No data to undo.

Nothing is published.
