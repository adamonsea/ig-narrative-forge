# Waitlist qualification questionnaire

Turn raw waitlist signups into qualified pilot candidates with a short, branded questionnaire, plus an admin view where you review answers and decide who to invite.

## What gets built

### 1. A five-question questionnaire page

New route `/waitlist/welcome?token=...`. Each waitlist entry gets a unique token, so the page can greet them, can't be spammed by strangers, and every answer set ties back to a real signup.

Tone: one question per screen, progress dots, big tap targets, around 45 seconds. Between questions a single line of benefit copy resurfaces what Curatr does — a whisper, not a sales page.

The five questions:
1. What subject or place would your feed cover? (short text)
2. Who is it for? (my community / my clients or members / my industry peers / just me for now)
3. Do you already publish anything? (newsletter / social account / website or blog / not yet)
4. Where do your stories come from today? (multi-select: local press, RSS, social, press releases, my own reporting, not sure yet)
5. How soon would you want to start? (this week / this month / just exploring)

Closing screen: thanks, what happens next, and a link to a live feed as a working example.

### 2. Answers stored and reviewable

Answers save against the waitlist entry. A new **Waitlist** panel in the admin dashboard lists every signup with email, plan interest, date, whether they completed the questionnaire, and their answers expanded inline. Includes CSV export and a copy-to-clipboard summary. No auto-scoring and no auto-invites — you read and decide.

### 3. Outreach email (drafted, not sent)

Copy for a short, personal invite email carrying their unique questionnaire link, written for the two genuine signups (`mylesford030@gmail.com`, `social@mohartmusic.com`). Delivered to you in chat as ready-to-paste text, plus a "Copy invite link" button beside each signup in the admin panel so you send from your own inbox.

## Technical notes

- New table `waitlist_responses` (waitlist_id, answers jsonb, completed_at) and an `invite_token` column on `waitlist`, backfilled for existing rows. RLS: admins read; the questionnaire writes only through a token-scoped edge function, never a direct client insert.
- New edge function `waitlist-questionnaire`: validates the token, returns the signup's email, validates the answer payload with zod, writes the response. Public but token-gated and rate-limited.
- Frontend: `src/pages/WaitlistWelcome.tsx` (single-question stepper reusing existing motion and heading components), route registered in `App.tsx`, and `src/components/admin/WaitlistPanel.tsx` mounted in `AdminPanel.tsx` behind the existing product-owner check.
- No change to the existing signup flow beyond appending the questionnaire link to the confirmation email, so future signups self-qualify on arrival.