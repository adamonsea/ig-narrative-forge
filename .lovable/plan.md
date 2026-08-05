# Feature deep-dive page (/features)

A dedicated page cataloguing what Curatr does, tiered so the headline capabilities lead and the long tail sits underneath. Each entry carries a short narration script written now, plus a slot for an avatar clip that can be rendered and dropped in later without touching the layout.

## Structure

```text
/features
  Hero            "Everything Curatr does"  + one-line promise
  Tier 1  (6)     Large rows: animated loop / avatar slot + 40-word script
  Tier 2  (~10)   Compact 3-col grid: title + one line, expandable to script
  Tier 3  (~8)    Plain checklist by category (admin, compliance, infra)
  CTA             Start curating free / See a feed / Watch the tour
```

## Tier 1 — headline features (avatar clip + animation each)

1. Source trawling — connect any RSS feed, news site or blog; scraped daily in the background.
2. Relevance filtering — keyword, locality and negative-keyword gatekeeping so only on-topic stories survive.
3. AI briefings — dry articles rewritten into clean, readable stories in your tone, always attributed.
4. AI illustrations — original editorial artwork per story, no stock photos, no rights headaches.
5. Multi-channel publishing — branded feed, newsletter, embeddable widget, social carousels.
6. Editorial control — every story queued for approve / edit / spike before it goes live.

## Tier 2 — depth features (animated loop, no avatar)

Play Mode swipe reader, quiz cards, sentiment tracking, daily and weekly briefings with audio, Reel Studio (9:16 video + static slide export), story archive and search, widget builder with domain analytics, subscriber and newsletter management, source health monitoring, duplicate and fresh-angle detection.

## Tier 3 — platform checklist

Multi-tenant feeds, role-based access, per-topic branding, custom domains, SEO and structured data, bot-aware SSR, RSS out, URL shortener, anonymity guard for sensitive stories, GDPR-compliant analytics, automated queue alerts.

## Scripts

Every tier-1 and tier-2 entry gets a 15-25 word narration line in the same voice as the explainer film — plain, concrete, no marketing throat-clearing. Scripts are the visible caption immediately; when an avatar clip is added later, the caption becomes its subtitle. No wording changes needed at clip time.

## Avatar clips — deferred

The page ships with animation + caption only. A per-feature clip map (same shape as the explainer's `AVATAR_CLIPS`) is created empty, so adding a clip is a one-line change per feature. Once the scripts are approved, clips get rendered in a batch using the existing presenter (Tahlia_public_5) and British voice (Pippa A) for continuity with the tour film.

## Technical notes

- New route `/features` rendering `src/pages/Features.tsx`; registered in `App.tsx`.
- Content lives in one data file, `src/components/features/featureCatalog.ts` — id, tier, title, body, script, loop name, optional clip URL. Page renders from it; nothing hardcoded in JSX.
- Animated loops reuse and extend `src/components/home/FeatureLoops.tsx` (Framer Motion, mobile-safe, loops already exist for illustrations, play, quiz, sentiment). New loops added as needed for tier 1, reusing the same chunky flat visual language.
- `src/components/features/FeatureAvatar.tsx` renders the clip when present, otherwise the loop plus caption — same fallback pattern as `ExplainerPlayer`.
- Homepage: teaser link from the "AI tools that drive engagement" section to `/features`; nav gets a Features link.
- SEO: page title under 60 chars, single H1, semantic `<main>`, meta description, JSON-LD ItemList of features.
- Accessibility: `prefers-reduced-motion` freezes loops; scripts are real text, not baked into video.
