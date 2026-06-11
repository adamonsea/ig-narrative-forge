# Story Reels — Premium Admin Teaser Export (9:16 Kinetic Video)

## What this is
A **premium feature for signed-up curatr users** (curators/admins), not feed/reader users. From the **published story queue in the admin**, a curator manually previews and downloads a single story as a short, paced **9:16 (1080×1920) kinetic-typography MP4** — a *teaser*, not the whole story.

Phase 1 = manual per-story preview + download. Bulk/automation comes later.

## Reel structure (locked v1 — 3 beats, ~12–15s)
Deliberately paced for readability and credibility, never gimmicky:

```text
Beat 1 — HEADLINE      ~4s   Story headline, kinetic per-word reveal,
                              feed/topic brand mark + source attribution.
Beat 2 — DETAIL        ~5s   One supporting detail slide (the hook /
                              key fact). Single idea, calm entrance.
Beat 3 — CTA           ~4s   "Read the full story" + the published feed
                              web address (e.g. curatr.pro/@user/feed-name),
                              brand mark, subtle motion only.
```

- Pull headline from `stories.title`; detail from the **first body slide** (`slides` ordered by `slide_number`, skipping the title slide); CTA URL = the story's published feed/topic URL + source attribution.
- One well-timed entrance per beat (masked per-word rise reusing the landing-H1 easing), gentle crossfades between beats, optional slow Ken-Burns on a background image. No bouncing, no rapid cuts.
- Respects reduced-motion: simple fades only when `useReducedMotion` is set.

## Engine
- **Browser preview** (free): React + Framer-style motion using the same slide content, played in a modal — instant, no render cost. This is the pacing/readability proof.
- **High-res MP4** (paid): **Remotion** rendered server-side on **Remotion Lambda (AWS)** from the *same* composition, so preview == download.
- No generative AI video in v1; existing Wan 2.2 pipeline untouched.

## Access model (two-layer gate)
1. **Feature unlock — subscription tier**: only paid curatr users see/use Reel export (role/subscriber check). Reader/feed users never see it (UI + server enforced).
2. **Per-render funding — credits**: each MP4 render deducts credits via existing `deduct_user_credits` RPC / `CreditService` (add `STORY_REEL` to `CREDIT_COSTS`). Browser preview is free; only the server render costs credits. Server re-checks tier + balance before triggering Lambda.

## Where it lives (admin published queue)
- Add a **"Reel" action** to each story in the admin published queue (`ApprovedQueue` / `ApprovedStoriesPanel` / `QueueManager` — confirm the live one in build), alongside the existing `CarouselExportButton`.
- Opens a **Reel Studio modal**:
  - Live 9:16 preview (play/replay) of the 3 beats.
  - Credit cost + balance; "Render & Download MP4" (disabled when tier-locked or low credits, with upsell copy).
  - After render: progress → final MP4 preview → Download.

## Data model (migration)
`public.reel_renders`: `id`, `story_id`, `created_by`, `status` (queued|rendering|ready|failed), `lambda_render_id`, `lambda_bucket`, `output_url`, `error`, `credits_spent`, `created_at`, `updated_at`.
- Standard grants (authenticated + service_role, no anon) + RLS with `(select auth.uid())`: owner manages own rows, admins read all via `has_role`, service_role full.
- Public-read `story-reels` storage bucket (matches existing bucket pattern).

## Remotion project (`/remotion`)
Single reusable composition (mirrors video-creator conventions — no per-story files):
- `StoryTeaser.tsx` — composition `story-teaser`, 1080×1920, 30fps, the fixed 3-beat sequence + `pace.ts` for timing.
- `Root.tsx` registers only `story-teaser`. Props via zod: brand name/colors, headline, detail text, feed URL, source label, optional bg image.
- Browser preview imports the **same** beat components so preview matches render.

## Edge functions
1. `render-story-reel` (JWT; verifies paid tier + credits): zod-validate `{ story_id }`, load story+slides (service role), map to teaser props, deduct credits, trigger `renderMediaOnLambda`, insert row, return `render_id` (refund on trigger failure).
2. `reel-render-status` (JWT; owner/admin): `getRenderProgress`; on completion copy MP4 → `story-reels`, set `output_url` + `status=ready`. Client polls or uses Realtime.

## Secrets / infra (one-time)
- `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION`.
- After one-time Lambda deploy: `REMOTION_LAMBDA_FUNCTION`, `REMOTION_SERVE_URL`.

## Scope guardrails
- 9:16 only; 3-beat teaser only (headline → detail → CTA); never the full story.
- Manual per-story only; no bulk/auto in v1.
- Multi-tenant: brand/colors/feed URL/source resolved per story+topic, no hardcoded topic IDs.
- Reader/feed users have zero access.

## Verification
- Sandbox render via Remotion CLI to validate the 3-beat pacing/readability before Lambda wiring.
- Tier gate: reader/free user can't see or call export; server rejects unauthorized callers.
- Credits: render deducts configured cost; low balance blocks with upsell; failed render refunds.
- E2E: published queue → Reel Studio → preview → render → MP4 (1080×1920) downloads and plays, ending on the feed URL CTA.

## Decision needed before build
Remotion Lambda needs an AWS account. Confirm AWS is fine, or say so and I'll swap the render host to a small dedicated Node worker (Railway/Render/Fly) — same composition, no AWS. The browser-preview phase can be built immediately either way.
