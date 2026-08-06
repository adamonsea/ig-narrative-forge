# Waitlist email + questionnaire: gaps to close before sending

Honest read: both are close, and the writing and design are strong. Neither is quite world class yet — the email has deliverability and follow-up gaps, and the form has no way back and asks a lot before giving anything. Below is what to fix, in priority order.

## What's already good
- Email: clean brand-led layout, one clear ask, dark-mode-safe buttons, human sign-off, WhatsApp route.
- Form: statement/question rhythm, objection rebuttals, progressive autosave, early-access ask at the close.

## Priority 1 — email correctness (must-fix before sending)
1. **Plain-text alternative.** The email is HTML only. A text version is one of the biggest single levers on inbox placement, and it renders for text-only clients.
2. **Preheader line.** Inbox previews currently show the wordmark. Add a hidden preheader: "A few questions so we build the feed you'd actually use."
3. **Reply-to Adam.** Sent from `noreply@curatr.pro` with no reply-to, so a genuine reply goes nowhere. Set a monitored reply address.
4. **List-Unsubscribe header.** Required by Gmail/Yahoo bulk-sender rules and cheap insurance even at low volume. Point it at the existing unsubscribe route.
5. **Duplicate signups get nothing.** A second signup returns 409 and sends no email, so anyone who signs up twice thinking it failed hears silence. Re-send the same confirmation with their existing token.
6. **Failed sends are invisible.** Resend errors are only logged. Record send status against the waitlist row so we can see who never received it.

## Priority 2 — make the email work harder
- A second, lighter questionnaire link near the sign-off, for people who read to the end before acting.
- Show one real story card image (a published Eastbourne illustration) so the product is visible without a click.
- Offer the 75-second explainer as the low-commitment option, with the live feed as a text link.
- Subject line: note a question-led variant to test once volume justifies it. No change now.

## Priority 3 — questionnaire completion
1. **No way back.** No Back control on any step, so a mis-tap is unfixable and people bail. Add a quiet Back on every question screen (and from the rebuttal back to blockers).
2. **Statements block progress.** Continue only appears once the typewriter finishes. Let a tap complete the typing instantly so fast readers aren't held.
3. **Length signal.** Seven statements plus seven questions with no time expectation. Add "About a minute — 7 quick questions" to the first statement, and a readable "3 of 7" beside the dots (the dots are aria-hidden with no text equivalent, so screen readers get no progress at all).
4. **Everything is mandatory.** Steps 0–3 each block Continue until something is picked. Keep the gate on step 0 only and allow skipping the rest — a partial answer set beats an abandon.
5. **Partial answers are saved but never surfaced.** Autosave works, but nobody is told who started and dropped out. Add a weekly digest to Adam of unfinished runs (email, last step reached, answers so far) for manual follow-up.
6. **No resume affordance.** Returning to the link restores answers but always starts at step 0. Jump to the first unanswered step and say "picking up where you left off".

## Technical notes
- Email work sits in `supabase/functions/waitlist-signup/index.ts` (template, Resend call, duplicate branch), plus one nullable send-status column on `waitlist`.
- Back navigation, skip logic, tap-to-finish typing and resume-step live in `src/pages/WaitlistWelcome.tsx`; the existing `phase`/`rebuttal` state machine supports it.
- The digest of unfinished runs extends `supabase/functions/waitlist-questionnaire/index.ts` with a scheduled summary, reusing the existing admin notification email path.