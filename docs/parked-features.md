# Parked features

Parked on 13 November 2026 to keep Curatr focused on its core loop: gather from
sources, review on the Desk, publish clean story cards.

**Parked means switched off for every feed** — hidden from every screen and
stopped in the background (crons, generation, scraping, audio credits). Every
feed's saved settings and collected data are left untouched in the database,
so switching a feature back on restores each feed exactly as it was.

## The switch

All six live in one file: `supabase/functions/_shared/parked-features.ts`
(the web app reads the same file through `src/lib/featureFlags.ts`).

```ts
export const FEATURES = {
  communityDiscussion: false,
  parliament: false,
  sentiment: false,
  emailSegments: false,
  audioBriefings: false,
  familySafe: false,
};
```

### To bring one back

1. Change its value to `true` in that file.
2. Update `src/lib/parkedFeatures.test.ts` (it guards that parked features stay off).
3. Redeploy the edge functions listed for that feature below, so the
   background jobs pick up the change. The web app picks it up on the next publish.
4. Each feed's own saved setting decides again — nothing needs re-entering.

The cron jobs were **not** unscheduled. While a feature is parked its jobs
still fire but return straight away (`{"skipped": true, "reason": "feature_parked"}`),
so no cron needs recreating when it comes back.

## Feeds that had a parked feature on when it was parked

| Feature | Feeds with it on (saved, untouched) |
|---|---|
| Community discussion | 3 feeds |
| Parliament | 1 feed — Eastbourne (tracking on, 1 tracked MP; its feed cards were already off and nothing had been collected since 26 Feb 2026) |
| Sentiment | 1 feed |
| Email segments | none (no segments exist) |
| Audio briefings | none |
| Family-safe | none |

---

## Community discussion (`communityDiscussion`)

**What it does.** Reads local subreddits/forums each night, extracts talking
points with an AI model, and can show a "community pulse" card in the feed.

**Why parked.** High setup effort and online chatter rarely reaches
publication quality; not part of the core curation loop.

**Stopped:** `reddit-community-scheduler` (two daily crons), `reddit-community-processor`.
**Hidden:** Settings → Extras → Community discussion; the community pulse card in public feeds.
**Kept:** `topics.community_intelligence_enabled`, `community_config`, `community_pulse_frequency`, `community_insights`, `community_pulse_keywords`.
**Redeploy on return:** `reddit-community-scheduler`, `reddit-community-processor`.

## Parliament (`parliament`)

**What it does.** Collects UK Parliament votes and debates for a feed's local
MPs, manages tracked MPs, and can show MP vote cards and a weekly parliament
digest in the feed.

**Why parked.** Only relevant to UK regional feeds and rarely used; it adds
weight to Settings for everyone else.

**Stopped:** `uk-parliament-collector`, `auto-detect-regional-mps` (both were only run on demand from Settings).
**Hidden:** Settings → Extras → Local reporting tools → Parliament (the Region box stays); Settings → Extras → In-feed cards → Parliament cards; parliament cards in public feeds.
**Kept:** `topics.parliamentary_tracking_enabled`, `topic_tracked_mps`, `parliamentary_mentions`, `topic_insight_settings.parliamentary_cards_enabled`, existing parliamentary stories.
**Redeploy on return:** `uk-parliament-collector`, `auto-detect-regional-mps`.

## Sentiment (`sentiment`)

**What it does.** Tracks chosen keywords, scores the tone of coverage
("coverage mood"), takes weekly history snapshots and generates sentiment
cards for the feed.

**Why parked.** Algorithmic tone scoring of news is blunt and rarely
actionable for editors.

**Stopped:** `sentiment-card-scheduler` (daily cron), `sentiment-history-snapshot` (weekly cron), `sentiment-detector`, `generate-sentiment-card`.
**Hidden:** Settings → Extras → Coverage mood; sentiment cards in public feeds.
**Kept:** `topic_sentiment_settings`, `sentiment_keyword_tracking`, `sentiment_keyword_history`, `sentiment_cards`.
**Redeploy on return:** the four functions above.

## Email segments (`emailSegments`)

**What it does.** Splits a feed's email subscribers into segments (e.g. by
partner site) that each get their own version of the daily/weekly email.

**Why parked.** Niche; curators almost always run one list.

**Stopped:** segment sends in `automated-roundup-notifier`; `send-email-newsletter`
ignores any segment and no longer excludes segment-matched subscribers from the
main send, so every subscriber still gets the plain email.
**Hidden:** Settings → Share and grow → Advanced → Email segments.
**Kept:** `email_segments` table (empty when parked), subscriber `source_domain` / `signup_source`.
**Redeploy on return:** `automated-roundup-notifier`, `send-email-newsletter`.

## Audio briefings (`audioBriefings`)

**What it does.** Turns daily/weekly roundups into spoken briefings
(ElevenLabs), charged at 30 credits each.

**Why parked.** High credit cost and a secondary medium next to Curatr's card format.

**Stopped:** `generate-audio-briefing` (no audio, no credits charged); the audio step in `generate-daily-roundup` and `generate-weekly-roundup`.
**Hidden:** Settings → Share and grow → Advanced → Daily audio briefing / Weekly audio review; audio players and audio icons on briefing pages.
**Kept:** `topics.audio_briefings_daily_enabled` / `audio_briefings_weekly_enabled`, existing `audio_url`s on roundups.
**Redeploy on return:** `generate-audio-briefing`, `generate-daily-roundup`, `generate-weekly-roundup`.
**Also check on return:** pricing copy and `src/lib/creditScaling.ts` still list audio's credit price.

## Family-safe (`familySafe`)

**What it does.** A rule-based filter (`supabase/functions/_shared/family-safe.ts`)
that leaves out adult, graphically violent and gambling stories before they are written.

**Why parked.** Out of place for serious news, where crime and courts are core
reporting; not needed for the core product yet.

**Stopped:** the filter in `auto-simplify-queue` and `enhanced-content-generator`; one-sentence setup (`suggest-feed-setup`) never suggests it.
**Hidden:** Settings → What we look for → Family-safe switch; the Family-safe choice in new-feed setup.
**Kept:** `topics.family_safe` (no feed had it on). Separate and still active: `brand_safe_pictures` — fandom/brand feeds never get drawn characters or logos.
**Redeploy on return:** `auto-simplify-queue`, `enhanced-content-generator`, `suggest-feed-setup`.
