## Investor-ready offer pass: honest, tight, no oversell

Goal: make `/` (Index.tsx) and `/pricing` (Pricing.tsx) read as confident where the product is genuinely solid, and honest-but-forward-looking where it isn't — so a buyer/investor sees credibility, not inflation. Frontend copy only; no backend or business-logic changes.

### Verified backing (state these with full confidence — they're real)
Each is backed by deployed edge functions / live app features:
- **Aggregation 24-7** — `universal-scraper`, `unified-scraper`, `topic-aware-scraper` + cron schedulers (`automated-scheduler`, `drip-feed-scheduler`).
- **AI rewrites with attribution** — `enhanced-content-generator`, `source-attributions`.
- **Email newsletters (daily/weekly digests)** — `send-email-newsletter`, `generate-daily-roundup`, `generate-weekly-roundup`, `automated-roundup-notifier`.
- **Carousel export** — `carouselExporter`, `CarouselExportButton`.
- **Mobile-first branded feed, Play Mode, editorial pipeline, analytics dashboard** — live pages, hooks, tables.
- **AI illustrations** — `story-illustrator`, `auto-illustrate-stories`.
- **Quiz cards** — `generate-quiz-questions`, `submit-quiz-response`.
- **Sentiment tracking** — `sentiment-detector`, `generate-sentiment-card`.

### Where we're currently overselling (fix these)

1. **Social distribution implies auto-posting.**
   - Reality: `social-media-publisher` does **not** post to any social API — it only flags a DB record (code comment: *"In a real implementation, this would integrate with social media APIs"*). Only carousel *export* works.
   - Fix: keep the feature, but make the verb unambiguous — "**Export** ready-to-post carousels for Instagram, LinkedIn, and X" — and avoid any "publish/schedule to social" phrasing. Frame native auto-posting as roadmap (see below).

2. **Pricing tiers advertise unbuilt features as if included.**
   - Not yet built: API access, team collaboration, multiple workspaces, custom branding, dedicated account manager, SLA, and the specific credit allotments (500 / 2,000 / 10,000).
   - Buttons already say "Coming soon" + waitlist (good, honest). But the bullet lists read as live promises.
   - Fix: add a clear caption to the pricing section — "Pricing is in development. Tiers, features, and credit limits below are indicative and may change before launch." Optionally tag not-yet-shipped bullets as "Planned".

3. **"Free to start" / "Start curating free".**
   - Currently true only because nothing is billed yet. Fine to keep for now, but pair it with the "pricing in development" framing so it doesn't read as a permanent free-tier commitment.

### Where we should undersell-but-mention (confident roadmap, not claims)
Add a short, restrained "On the roadmap" line/section so the investor sees ambition without us pretending it's shipped:
- Native one-click publishing to social platforms (today: export).
- Subscriptions & monetization (Stripe), team workspaces, API access.
Keep it to 1–2 sentences or a compact list — clearly labelled as upcoming, not available.

### Files to change
- `src/pages/Index.tsx` — tighten social-carousel verb to "export"; optionally add a small, clearly-labelled "Roadmap" note near the CTA.
- `src/pages/Pricing.tsx` — add "pricing in development / indicative" caption; optionally mark unbuilt bullets as "Planned".

### Out of scope
- No new backend (no real social auto-posting, no billing). Those stay as labelled roadmap items.

### One decision for you
Tone of the unbuilt items — pick one:
- **(A) Lean & confident:** soften pricing with the "indicative" caption, fix the social verb, no separate roadmap section. Shortest, tightest.
- **(B) Lean + visible roadmap:** all of A, plus a compact labelled "On the roadmap" block so the investor sees the forward plan explicitly.
