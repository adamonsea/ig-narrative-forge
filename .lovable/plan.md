# Waitlist qualification questionnaire

Turn raw waitlist signups into qualified pilot candidates with a short, branded questionnaire, plus an admin view where you review answers and decide who to invite.

## What gets built

### 1. A six-question questionnaire page

New route `/waitlist/welcome?token=...`. Each waitlist entry gets a unique token, so the page can greet them, can't be spammed by strangers, and every answer set ties back to a real signup.

Tone: one question per screen, progress dots, big tap targets, around 45 seconds. Tapping an option advances automatically — no Next button, no typing required to finish.

**Every screen opens with one short context line** above the question — a plain reminder of the part of Curatr that question relates to, so the answer is framed rather than guessed at. Small, muted, one line, never more.

**Everything is tap-first.** No question requires typing. Where free text would be richer, the screen offers choices plus a quiet "add a detail" link that expands a small optional text box. Skipping it is normal and costs nothing.

#### What we need to learn, and the question that gets it

Nothing is asked directly. Each question is a natural thing to ask a curator, and each one carries a signal underneath.

**1. What kind of feed?**
Context: *Curatr builds a running feed on one subject or place.*
Tap one: a town or area / an industry or beat / a cause or campaign / a hobby or scene / not decided yet.
Then an optional one-line "name it" box, pre-focused but skippable.
*Tells us:* fit, and your topic taxonomy. A named subject is a strong intent signal.

**2. Who's it for?**
Context: *Feeds can be public, or built for a specific audience.*
Tap one: my town or community / my members or clients / my industry peers / just me for now.
*Tells us:* segment and monetisation path. "Members or clients" signals willingness to pay.

**3. What are you doing about it today?**
Context: *Curatr replaces the trawling, writing and image-making.*
Tap one: running a newsletter / posting to social / a site or blog / keeping track by hand / nothing yet.
*Tells us:* keenness proven by behaviour rather than stated intent. Someone already doing the manual work is the best pilot.

**4. What made you sign up?**
Context: *Curatr gathers local stories, rewrites them, and illustrates them daily.*
Tap up to two: it does the trawling for me / the finished stories and images / the local focus / it looks publishable / I saw a feed I liked / just curious.
*Tells us:* what resonated — the message that pulled them in. Feeds straight into homepage and pricing copy.

**5. What would make this a no?**
Context: *Honest answers here shape what we build next.*
Tap any that apply: too expensive / not sure I'd trust the writing / no time to run it / needs to carry my own brand / needs to sit on my own site / nothing springs to mind.
Optional "say more" box.
*Tells us:* the objection to design away — the single highest-value answer, and one analytics can never give you.

**6. If it worked exactly as you hoped, what's it worth a month?**
Context: *Plans aren't fixed yet — this genuinely sets the price.*
Tap one: under £10 / £10-25 / £25-60 / £60+ / only if free.
*Tells us:* price anchoring against your plans, plus a soft keenness read. Framed as value, never "what would you pay".

**7. Optional, skippable:** "Anything you'd want it to do that we haven't mentioned?" — free text, clearly marked optional, with a "no, I'm done" button of equal weight. Unqualified requests here are the clearest roadmap input you'll get.

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