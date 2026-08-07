# Send the waitlist emails to the two recent signups

Nobody on the waitlist has been emailed yet — every row has an empty `confirmation_sent_at`. The signup function sends the confirmation at the moment someone joins, but these two joined before that email existed, so there is no path today to send them their copy.

## What gets built

A small owner-only send tool that mails the existing waitlist email — same design, same personal opening from Adam, same "Early adopter questionnaire · 1 min" CTA and live story preview — to selected waitlist entries, using each person's own questionnaire token so their answers are attributed to them.

Recipients for this run:
- social@mohartmusic.com (joined 3 Aug)
- mylesford030@gmail.com (joined 29 Jul)

Two modes:
1. **Preview** — sends both versions to adamonsea@gmail.com, exactly as each recipient would receive them (their token, their live story preview), with the recipient's address noted in the subject.
2. **Send** — mails the real recipients, then stamps `confirmation_sent_at` on their waitlist rows so they can never be double-sent, and records any failure in `confirmation_error`.

Order of play: build it, run the preview to you, you read it, then I run the real send on your go-ahead.

## Safeguards

- Only reachable by the product owner account; not callable from the public site.
- Skips anyone who already has `confirmation_sent_at` set, unless explicitly overridden.
- Recipients are passed in explicitly — no "email the whole table" path.
- If Resend errors, the row stays unsent and the error is stored, so a retry is safe.

## Technical detail

- New edge function `supabase/functions/waitlist-send-confirmations/index.ts`: verifies the caller's JWT is the owner, accepts `{ emails: string[], mode: 'preview' | 'send' }`, looks up each row in `waitlist` (id, plan, invite_token), and reuses `_shared/waitlist-email.ts` (`buildWaitlistEmailHtml` / `buildWaitlistEmailText`, `WAITLIST_FROM`, `WAITLIST_REPLY_TO`, `WAITLIST_SUBJECT`, `WAITLIST_HEADERS`) so the copy stays in one place.
- Story preview: lift `fetchStoryPreview` out of `waitlist-signup/index.ts` into `_shared/waitlist-email.ts` so both functions use the identical live-story lookup rather than a copy.
- Uses the service-role client for the `waitlist` read and the `confirmation_sent_at` / `confirmation_error` write.
- Deploy the function, then invoke it in preview mode, then in send mode after your approval. No schema changes and no frontend changes.
