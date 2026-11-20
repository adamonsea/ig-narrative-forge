# Reader counting: UK anonymous statistics, EU consent-only

## Answer to question 6
Yes. "Essential only" switches off every reader count: visits, headline pauses, swipes, time on a story page, and Google Analytics. Only source-link and share clicks are still recorded, which goes against the reader's choice. Also, today a reader who never answers is counted everywhere, including in the EU.

## What changes for readers

```text
Where the reader is      Default                         Reader can
UK (GB)                  Counted anonymously             Opt out (one tap) / Accept full
EU/EEA, Switzerland,     Not counted until they Accept   Accept / Reject (equal buttons)
unknown location
Rest of world            Unchanged (counted)             Opt out
Any browser sending      Never counted                   -
Global Privacy Control
```

- **UK notice** (shown once on feeds and story pages, not blocking): "We count reads anonymously to improve this feed. Opt out · OK". There is also a permanent "Reader counting" link in the feed menu and on the cookie page, which switches it on or off at any time.
- **UK readers who already chose "Essential only"** see the new notice once. They are counted only after it has been shown and they haven't opted out, so nobody is switched on without being told.
- **EU banner**: Accept all / Reject all at equal size, plus Cookie settings (Necessary always on, one Analytics switch). Closing or ignoring it grants nothing.
- **Anonymous means**: no ID is kept on the device (see the open question). There's no profiling, no ads and no sharing. Feed owners see only totals, never individual readers.
- **Google Analytics** sends data to Google, so it's never covered by the UK exemption. It loads only after Accept in the UK and EU (see the open question).
- Source-link and share clicks follow the same rules as every other count.

## What changes on the owner's figures
- UK readers who ignore the banner or chose "Essential only" start appearing in Reads and Readers again (Eastbourne's missing iPhone readers).
- Anonymous visits never count towards Returning readers.
- **EU feeds will show fewer readers.** Readers who ignore the banner stop being counted, and that includes Whats on Lisbon. This follows your rule; it is not a fault.
- Bot filtering, the wait-for-a-real-person rule, owner exclusion and the definitions of reads and readers stay the same. Numbers are never padded.

## Known limits
- If you read a feed on a phone without being signed in, the anonymous mode can't recognise you as the owner, so those visits may count. Signed-in visits are still excluded.
- Location comes from the site's own server, not a third party. If it can't be worked out, the reader is treated as EU (consent only).
- Jersey, Guernsey and the Isle of Man have their own rules, so they're treated as consent-only.

## Legal check (yours)
The plan relies on the Data (Use and Access) Act 2025 exemption for statistics: clear information, a simple free way to object, used only to improve the service. I can't confirm it's in force for this use, or that showing totals to feed owners fits it. Please check with someone who knows UK and EU rules before this goes live. I'll update the cookie and privacy pages with the wording below for you to review.

## Technical details
1. **One rule, one module**: `src/lib/readerConsent.ts` exports a pure `readerTrackingMode({ country, choice, ukNoticeSeen, optedOut, gpc })` returning `'full' | 'anonymous' | 'off'`. `canTrackReader()` in `visitorIdentity.ts` becomes `!isLikelyBot() && mode !== 'off'`, and `getVisitorId()` returns an in-memory `anon_<random>` (never written to storage) when the mode is `'anonymous'`. Every existing tracker (visits, headline stops, swipes, page dwell, A/B, play mode, source/share clicks) already goes through these two functions, so they all follow without per-tracker logic. AGENTS.md's tracker rule is updated to name the new gate.
2. **Consent storage and region**: copy the cookie-consent skill's `src/lib/consent.ts` (per-purpose answers, `/cdn-cgi/trace` country lookup, which is confirmed working on curatr.pro, GPC = deny). Add a UK split: GB → statistical tier; EEA/CH/CA/unknown/crown dependencies → consent. Existing `cookie_consent` answers move once (analytics true → granted, false → denied), and the old key stays so it can be rolled back. Opt-out is a single local flag (remembering an objection is necessary storage).
3. **Remove the ipapi.co country call** in `getCachedCountry()` (it sends readers' IP addresses to a third party). Use the same first-party lookup.
4. **Google Consent Mode**: the skill's defaults script goes first in `__root.tsx` `head()`, replacing the hand-rolled `cookie_consent` check in `GA_LOADER`. This lets Lovable's own click tracking follow the EU answer too.
5. **Database**: no schema change. The returning-readers and visitor-count functions skip `anon_` IDs, and `record_story_interaction`/`site_visits` are checked to accept them. Engagement and reads functions are unchanged, so the definitions stay the same.
6. **Banner**: `CookieConsent.tsx` gets a UK notice variant and an EU Accept/Reject/Settings variant, using feed tokens on feeds and shop-window styling on marketing pages. The Cookie settings link goes in the feed menu.
7. **Tests** (`src/lib/readerConsent.test.ts`): GB no answer → anonymous; GB opted out → off; GB legacy "Essential only" before notice → off, after notice → anonymous; GB Accept → full; EU no answer → off; EU Accept → full; unknown country → off; US no answer → full; GPC → off everywhere; anonymous mode never writes `curatr_vid`.
8. **Verify**: Playwright with `zztest_` IDs and spoofed `/cdn-cgi/trace` responses (GB, PT, US) checks that requests fire or stay silent as listed. Eastbourne and Lisbon feeds still load, and the Desk and dashboard figures read correctly.
