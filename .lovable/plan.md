# Feed Idea Generator → Seamless Sign-up → Build Flow

## The journey

1. **Homepage generator (no account)** — One input in the hero: a website address or a niche. In a few seconds we show 3 feed blueprints (for customers, for the internal team, for partners/community), each with a purpose line, sample story angles, and suggested source types.
2. **"Build this feed"** — The chosen blueprint is saved locally, then we ask for an account.
3. **Account step (new)** — A single lightweight sheet: "Save your feed — where should we send it?" Email + password (and Google if enabled later). No credit card, no extra questions. They land straight in the build flow afterwards.
4. **Build flow** — The existing feed creation wizard opens automatically, pre-filled with the blueprint's name, description, keywords and suggested sources, then runs the normal discovery and fills Arrivals with real stories.
5. **Free sandbox** — Full curating, editing, a few free image generations, dashboard and review tools. Feed stays private.
6. **Paywall at distribution only** — Going public, embed widget, email newsletter/RSS, and the ChatGPT/Claude feed each open the plan sheet.

## Where the account step sits

After the blueprints are shown and they pick one, before the build flow. That's also the practical requirement: a feed belongs to a user account, and sources, stories and images can't be saved without one.

To keep it seamless:
- The blueprint is kept in the browser, so nothing is lost if they bounce around.
- Sign-up signs them straight in (no "check your email" wait), and they go directly into the wizard with everything pre-filled.
- Their email is stored with the blueprint they chose, so we can follow up automatically if they don't finish.

## What gets built

**New homepage section** in `src/pages/Index.tsx`: input bar, loading beat, three result cards, "Build this feed" buttons.

**New Edge Function `feed-ideas`**: accepts a domain or free-text niche, fetches the site's title/description when it's a domain, asks the model for strict JSON — 3 blueprints with `audience_type`, `feed_title`, `purpose`, 3 `sample_story_hooks`, `keywords`, `suggested_sources`. No auth required; input validated with Zod; rate-limited by IP.

**Blueprint handoff**: stored in `localStorage` under a versioned key and read by the dashboard on arrival.

**Account step**: a compact sign-up sheet (email + password) shown inline after blueprint selection. Uses Supabase email auth with auto-confirm enabled so sign-up yields an immediate session. Existing users get a "Sign in instead" toggle. `src/pages/Auth.tsx` currently ignores a `redirect` param and always sends users to `/` after sign-in — it gets redirect support so any fallback path also lands correctly.

**Lead capture table** `feed_leads`: email, input given, chosen blueprint JSON, user_id once created, timestamps. RLS: insert by the edge function (service role), read restricted to the product owner. Grants included. This is what feeds the follow-up email flow.

**Auto-open wizard**: `Dashboard` checks for a pending blueprint and opens `CreateTopicDialog` pre-populated (name, description, keywords, suggested sources), then clears the stored blueprint.

**Follow-up email**: a scheduled function that emails leads who created an account but have no published stories after 48 hours. Sent via the existing Resend setup.

## Notes

- Nothing about existing feeds, pricing or dashboards changes; this is additive.
- The paywall gates stay as described — no new billing work in this plan beyond wiring the distribution prompts to the existing plan sheet.
