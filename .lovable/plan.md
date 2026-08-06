# Personal opening line in the waitlist email

Right now the email opens with an anonymous "Hi — thanks for signing up to Curatr", and only reveals a human at the very bottom ("Adam / Curatr maker"). Leading with the person is the stronger move: it sets up the reply invitation, the WhatsApp button and the "it genuinely shapes what we build" line, all of which currently arrive from a faceless sender.

## The change

Replace the opening paragraph with a first-person introduction:

> Hi, Adam here — I make Curatr. Thanks for signing up[ for the Pro plan]. I'm speaking to everyone on the waitlist before we open up, so I build the thing people actually want. Could you answer a few questions? It takes about a minute.

Two knock-on tweaks so the email doesn't repeat itself:

- The paragraph after the button shifts to "we" → "I" phrasing where it refers to the maker, keeping the product description itself neutral.
- The sign-off loses the now-redundant "Curatr maker" label and becomes just "Adam — hit reply, I read everything", since he's already been introduced at the top.

The plan-name insert ("for the Pro plan") keeps working exactly as it does today, and the subject line, preheader, story preview, CTAs, tour link and footer all stay as they are.

## Optional, say the word

A small round photo of Adam beside the opening line would push this further — it is the single biggest lift for a "maker writing to you" email. It needs a hosted image (the same one used for the presenter thumbnail on the homepage would do). Not included in the change above unless you want it.

## Technical detail

- `supabase/functions/_shared/waitlist-email.ts`: update the opening `<p>` in `buildWaitlistEmailHtml`, the matching lines in `buildWaitlistEmailText`, and the sign-off block in both. The `planLine()` helper is reused unchanged so the HTML and plain-text versions stay in sync.
- No schema, function-signature or send-path changes — `waitlist-signup` and the admin preview both build from this one file, so they update together.
- After the edit, redeploy `waitlist-signup` and `waitlist-email-preview`, then send a preview to adamonsea@gmail.com so you can read the new version in a real inbox before it goes to anyone.