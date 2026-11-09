# Public feed: stories + email sign-ups

## Part A — status of each extra (Eastbourne, checked today)

- **Sentiment cards** — keyword "mood" slides. 9 cards, newest 29 Jan 2026, all still shown. **Stale and the stats are not valid**: the "last week" bar is hard-coded to 70% of this week, so every card shows a fake rise. Curator switch exists (Sentiment settings), but the feed **ignores it** and shows any published card.
- **Quiz** — multiple-choice question every 9 stories. 101 questions (newest today), 1 answer ever. Working but unused. Switch: Insight settings → Quiz cards (on).
- **Automated insight cards** — "story momentum / social proof" cards every 7 stories. 2 live, newest 8 Nov. Half-built: thin data, figures come from tiny reader counts. Switch: `automated_insights_enabled` (on).
- **Flashback ("this time last month")** — one panel at story 16, built live from stories + reactions. Working but stats rest on very few reactions. Switch: Insight settings → This time last month (on).
- **Parliamentary cards + digest** — MP vote cards every 13 stories, digest at story 12. 45 mentions, newest 26 Feb 2026. **Stale**. Switch: Parliamentary tracking (on).
- **Community pulse** — Reddit discussion slides. No data; already off. Nothing to do.
- **Events card** — events list every 11 stories. 149 events, newest 6 Nov. Working. Switch: Events (on).
- **Email sign-up card** — after story 9, then every 20. Working, but small and quiet. 63 active subscribers, 0 new in 30 days.

## Part B — plan

### 1. Sign-up card
- Positions: after story 3, after story 13, then every 15 (28, 43, 58…).
- Layout: feed favicon, large brand serif headline "Never miss another story from {feed name}", one line "The best of {feed name}, in your inbox daily or weekly.", email field and one button inline (stacked on narrow phones), small Daily/Weekly choice under the field (Daily default). Brand navy/mint tokens, generous type, no icons clutter.
- Already subscribed: one quiet "You're on the list" line.
- Unchanged underneath: same `secure-newsletter-signup` call, same `topic_newsletter_signups` rows, same confirmation email, same subscriber counts. Still only shows when the feed has email sign-ups switched on.
- **Before building:** I'll make a static mock (desktop + phone) and show you it for approval.

### 2. Turning extras off for Eastbourne (via its own settings)
Current value → new value:
- `topic_insight_settings.quiz_cards_enabled`: true → false
- `topic_insight_settings.this_time_last_month_enabled`: true → false
- `topics.automated_insights_enabled`: true → false
- `topic_sentiment_settings.keyword_cards_enabled`: true → false
- `topic_sentiment_settings.comparison_cards_enabled`: true → false
- `topics.events_enabled`: true → false
- `topics.community_intelligence_enabled`: already false
- Parliamentary: new `topic_insight_settings.parliamentary_cards_enabled` (default false) controls the feed cards only, so `parliamentary_tracking_enabled` stays true and collection plus the weekly email's chamber section keep working.

Small code fixes needed so the settings are truly the source of truth:
- Feed hides sentiment cards unless the feed's sentiment switches are on (today it ignores them).
- Feed shows parliamentary cards/digest only when the new feed switch is on, with a toggle beside it in Insight settings.
- Events: confirm the weekly email doesn't read `events_enabled`; if it does, add a separate feed-only switch the same way instead of turning `events_enabled` off.

I'll also fix the fake "last week" bar (show only this week's count) so a curator who switches sentiment back on doesn't see invented numbers.

### 3. New feeds
Today new feeds get `automated_insights_enabled = true` and `topic_sentiment_settings.enabled = true`; everything else already defaults off. Change both defaults to off and add the new parliamentary feed switch off by default. Existing feeds other than Eastbourne are not touched.

### 4. Integrity and checks
- **Sign-up flow, confirmation email, subscriber counts:** one test signup with `zztest_…@example.invalid`-style address only (never a real-looking email), confirm the row lands with the right topic, then delete only that row. Dashboard subscriber count compared before and after.
- **Weekly email incl. chamber events:** dry-run the weekly email for Eastbourne and confirm the parliament and events sections still populate.
- **Widget:** unchanged code; check its feed data still returns.
- **Readership / card positions:** extras removal shifts nothing in story positions (positions count stories only); confirm via the existing tests and a Playwright run with `zztest_` visitor ID.
- **Feed check:** screenshot Eastbourne feed showing only stories plus sign-up cards at 3, 13, 28.
- Reversible: every field above listed with its old value.

## Technical notes
- Positions in `src/lib/feedCardPositions.ts` (emailBriefing becomes single at 3 + repeating interval 15 offset 13); add a unit test for 3/13/28/43.
- Gating in `src/pages/TopicFeed.tsx`; sentiment hook reads `topic_sentiment_settings`.
- Migration: add `parliamentary_cards_enabled`, change two column defaults; Eastbourne value changes done as data updates.
