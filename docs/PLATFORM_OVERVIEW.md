# Platform Description — Curatr (eeZee News)

This document covers **what** has been built and is in active use, stays general about **how**, and omits experimental or unverified features.

---

## 1. What it is

Curatr (curatr.pro) is a multi-tenant editorial platform that lets independent curators build, manage, and publish niche local or topic-based news feeds. Each curator owns one or more topics, connects sources, and runs a lightweight approve/publish pipeline. Readers consume feeds on the web, via social-style carousels, email newsletters, embeddable widgets, and interactive "play" modes.

It is live in production at `curatr.pro` (published mirror at `breefly.lovable.app`).

## 2. Core capabilities (in active use)

- **Multi-tenant topics/feeds** — every feature is topic-scoped; no hardcoded topics. Public feed routes under `/feed/:slug` with archive, briefings, about, and per-story pages.
- **Content ingestion pipeline** — sources are scraped/ingested, deduplicated, quality-scored, and rewritten/summarized before entering an Arrivals → Approved → Published flow. Strong source attribution (author · publication) is preserved throughout.
- **Locality gatekeeper** — regional topics require a local anchor (region, landmark, postcode, organisation) before stories auto-advance, keeping geographically loose stories out of automated publishing.
- **Editorial dashboard** — per-topic management of sources, keywords, pipeline queues, voice/tone settings, and publishing controls, with a minimalist SaaS-style UI.
- **Reader surfaces** — web feed, story pages, daily/weekly roundups, audio briefings, swipe and explore "play" modes, and social carousel/slide exports.
- **Reel studio** — client-side 9:16 video and static-slide generation for social sharing, with on-frame source attribution.
- **Newsletter & notifications** — email signup (server-side, hardened), token-based unsubscribe, and story notifications.
- **Embeddable widgets** — public widget builder with compact/wide layouts and embed analytics.
- **Discovery** — public `/discover` directory of feeds plus dynamic sitemaps and SEO/structured-data tooling.
- **Analytics** — visitor, engagement-funnel, source/story, and sentiment metrics for curators, with crawler traffic filtered out.

## 3. Technology stack

**Frontend**
- React 18 + TypeScript 5, built with Vite 5.
- Tailwind CSS v3 with shadcn-ui (Radix primitives) and a centralized semantic design-token system (`src/lib/designTokens.ts`) — no hardcoded colors.
- TanStack Query for data fetching/caching; React Router v6 for routing.
- Framer Motion for animation; Recharts for analytics; DOMPurify for HTML sanitization; React Helmet Async for metadata/SEO.

**Backend (Lovable Cloud / Supabase)**
- Supabase Postgres with Row-Level Security throughout.
- ~160 Deno edge functions covering scraping, content generation, scheduling/automation, analytics, notifications, media generation, and maintenance.
- Supabase Storage for assets (illustrations, audio briefings, OG images, widget avatars, exports).
- AI via the Lovable AI Gateway and configured providers for text rewriting, image generation, and text-to-speech (ElevenLabs voice for briefings).

**Hosting & delivery**
- Production on Netlify at `curatr.pro`, with bot-aware delivery (semantic HTML/SSR to crawlers) and redirect-based proxying to edge functions.

## 4. Security model

- **Authentication & roles** — Supabase Auth (email/password + magic link). Roles (`superadmin`, `admin`, `user`) are stored in a dedicated `user_roles` table, never on profiles, and checked via a `SECURITY DEFINER` `has_role` function to avoid privilege escalation and RLS recursion. Product-owner-only capabilities are gated to a single owner account.
- **Row-Level Security** — enabled across tables; policies are topic-ownership / role scoped, with `auth.uid()` wrapped in subqueries for performance. Public-readable data (published stories, public feeds) is explicitly scoped; internal/system tables are restricted to owners, admins, or the service role.
- **Edge function tiers** — a shared auth helper enforces three tiers: public (Zod-validated input), mixed (JWT-authenticated), and internal (service-role only). Mutation, deletion, notification, analytics, and upload functions verify JWT and topic ownership.
- **Hardening already applied** — sanitized generic error responses (no internal leakage), trusted-origin allowlists on URL shortener/redirects, XML-escaped and HTTPS-restricted OG image inputs, server-side client-IP extraction for newsletter signups, DOMPurify on rendered slide/story HTML, scoped Realtime channel policies, and revoked public EXECUTE on internal maintenance functions.
- **Secrets** — credentials live in Supabase/edge secrets, never in the database or client. The frontend uses only the anon/publishable key; the service role key never reaches the browser.
- **Compliance posture** — attribution and source links preserved for fair-use credibility; GDPR/UK-DPA-aware data handling; accessibility work toward WCAG 2.1 AA on reader surfaces (landmarks, headings, labeled controls, contrast, dynamic-viewport sizing).

## 5. Why it is stable and valid for developers

- **Conventional, well-supported stack** — standard Vite/React/TypeScript/Tailwind/shadcn foundation with mainstream libraries, making the codebase approachable and maintainable.
- **Clear separation of concerns** — presentation in React components, business logic and privileged operations in edge functions, data integrity enforced at the database via RLS and validation triggers (not brittle check constraints).
- **Defense in depth** — security enforced at multiple layers (auth, RLS, grants, edge-function tiers, input validation, output sanitization) rather than any single gate.
- **Multi-tenant by construction** — universal, topic-scoped design avoids per-customer special-casing and supports horizontal growth.
- **Operational tooling** — extensive automation, health checks, source-health monitoring, and recovery functions support day-to-day reliability.