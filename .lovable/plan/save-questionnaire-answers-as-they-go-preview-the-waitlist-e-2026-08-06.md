# Save questionnaire answers as they go + preview the waitlist email

## 1. Progressive saving

Right now nothing is stored until the final screen. If someone drops out at question 3, that useful signal is lost.

Change: every answer is saved the moment it's made.

- Each time an option is tapped (or an optional text box is left), the current answer set is sent to the questionnaire function and written against that person's waitlist entry.
- One row per signup, updated in place — so a partial run and a completed run never create duplicates, and someone returning to the link picks up where their answers left off.
- `completed_at` is only stamped on the final screen, so the admin panel can still tell finished from partial.
- The admin notification email still fires once, on completion only — no drip of partial emails.
- Saving is silent and non-blocking: a failed autosave never interrupts the flow, and the final submit still surfaces an error if it fails.

Partial responses appear in the Waitlist panel marked "in progress" so drop-off points are visible.

## 2. Email preview

Two emails exist for waitlist signups. I'll show both in chat:

- **Confirmation email** (sent on signup, carries the questionnaire link) — current copy plus a rendered screenshot of the design.
- **Admin completion notification** (sent to you when someone finishes) — same treatment.

Plus the short personal invite copy scoped earlier for the two existing genuine signups, ready to paste and send from your own inbox.

No changes to either email in this step — review first, then tweak.

## Technical notes

- Migration: unique partial index on `waitlist_responses(waitlist_id) where is_preview = false`, allowing upsert.
- `supabase/functions/waitlist-questionnaire/index.ts`: POST accepts a `partial: boolean`; upserts on `waitlist_id`, sets `completed_at` and sends the admin email only when `partial` is false. GET returns any saved `answers` so the form can resume.
- `src/pages/WaitlistWelcome.tsx`: debounced (~600ms) autosave effect on the answers object; hydrate initial state from the GET response; keep existing error handling on final submit.
- Preview screenshots rendered from the existing HTML templates in `waitlist-signup` and `waitlist-questionnaire` — no template edits.
