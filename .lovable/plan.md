# Waitlist qualification questionnaire

Turn raw waitlist signups into qualified pilot candidates with a short, branded questionnaire, plus an admin view where you review answers and decide who to invite.

## What gets built

### 1. A six-question questionnaire page

New route `/waitlist/welcome?token=...`. Each waitlist entry gets a unique token, so the page can greet them, can't be spammed by strangers, and every answer set ties back to a real signup.

Tone: one question per screen, progress dots, big tap targets, around 45 seconds. Between questions a single line of benefit copy resurfaces what Curatr does — a whisper, not a sales page.

#### What we need to learn, and the question that gets it

Nothing is asked directly. Each question is a natural thing to ask a curator, and each one carries a signal underneath.

| Question on screen | What it tells us |
| --- | --- |
| 1. "What would your feed be about?" (short text, placeholder: a town, a beat, an obsession) | Fit. A specific answer means a real intent; a vague one means browsing. Also builds your topic taxonomy. |
| 2. "Who's it for?" (my town or community / my members or clients / my industry / just me for now) | Segment and monetisation path. "Just me" signals a hobbyist; "members or clients" signals willingness to pay. |
| 3. "What are you doing about it today?" (running a newsletter / posting to social / a site or blog / doing it by hand in my head / nothing yet) | Keenness, proven by behaviour rather than stated intent. Someone already doing manual work is the highest-value pilot. |
| 4. "What made you sign up?" (multi-select, max two: it does the trawling for me / the finished stories and images / the local focus / it looks good enough to publish / I saw a feed I liked / curiosity) | What resonated — the message that pulled them in. Directly informs homepage and pricing-page copy. |
| 5. "What would make this a no?" (multi-select: too expensive / not sure I'd trust the writing / no time to run it / need it to look like my own brand / need it on my own site) | The objection to design away. This is the highest-value answer on the form and the one you can't get from analytics. |
| 6. "If it worked exactly as you hoped, what's it worth a month?" (under £10 / £10-25 / £25-60 / £60+ / would only use it free) | Price anchoring against your plans, and a soft keenness read. Framed as value, not "what would you pay". |

A seventh, optional, skippable screen: "Anything you'd want it to do that we haven't mentioned?" (free text). Unqualified requests here are the clearest product roadmap input you'll get.

Timing is captured implicitly rather than asked: the closing screen offers "I'd like early access — put me at the front" as a single button, and pressing it is the keenness signal. No "how soon would you start?" question needed.

Closing screen: thanks, what happens next, and a link to a live feed as a working example.

### 2. Answers stored and reviewable

Answers save against the waitlist entry. A new **Waitlist** panel in the admin dashboard lists every signup with email, plan interest, date, whether they completed the questionnaire, whether they asked for early access, and their answers expanded inline. Includes CSV export and a copy-to-clipboard summary. As responses accumulate the panel also shows simple tallies for the three research questions (what resonated, what would make it a no, price band) so patterns surface without you reading every row. No auto-scoring and no auto-invites — you read and decide.

### 3. Outreach email (drafted, not sent)

Copy for a short, personal invite email carrying their unique questionnaire link, written for the two genuine signups (`mylesford030@gmail.com`, `social@mohartmusic.com`). Delivered to you in chat as ready-to-paste text, plus a "Copy invite link" button beside each signup in the admin panel so you send from your own inbox.

## Technical notes

- New table `waitlist_responses` (waitlist_id, answers jsonb, completed_at) and an `invite_token` column on `waitlist`, backfilled for existing rows. RLS: admins read; the questionnaire writes only through a token-scoped edge function, never a direct client insert.
- New edge function `waitlist-questionnaire`: validates the token, returns the signup's email, validates the answer payload with zod, writes the response. Public but token-gated and rate-limited.
- Frontend: `src/pages/WaitlistWelcome.tsx` (single-question stepper reusing existing motion and heading components), route registered in `App.tsx`, and `src/components/admin/WaitlistPanel.tsx` mounted in `AdminPanel.tsx` behind the existing product-owner check.
- No change to the existing signup flow beyond appending the questionnaire link to the confirmation email, so future signups self-qualify on arrival.