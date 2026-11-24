# Editorial Profile, event copy and API (Lisboa List as one configuration)

Lisbon becomes a saved profile, not code. Any feed can switch it on.

## Phase 1–2 database changes

New, generic (all per feed or per event, nothing Lisbon-named):

1. `feed_editorial_profiles` (one row per feed, owner-only)
   - `languages` text[] in order (Lisbon `{pt-PT,en}`, Eastbourne `{en}`)
   - `caption_templates` jsonb: per platform (`instagram` now; `website`, `facebook` later) a list of lines with field tokens, each line dropped when its tokens are empty
   - `fixed_hashtags` text[], `event_hashtag_min/max` (default 2/4)
   - `genres` jsonb (list + mapping from source categories/tags), `flags` text[]
   - `voice_rules` text[] (e.g. no promo words, no "!", pt-PT not pt-BR)
   - `enabled` boolean, off by default

2. `event_copy`: one row per event × language × kind
   - kinds: `synopsis`, `extra_facts`
   - `text`, `source_hash`, `generated_at`, `edited_at`, `edited_by`
   - unique (event_id, language, kind)

3. `event_captions`: one row per event × platform (× language when a platform needs one)
   - assembled text, `source_hash`, `edited_at`, `edited_by`
   - stored only so hand edits stick; when unedited it is rebuilt by code

4. `event_field_edits`: per-field edit locks for gathered fields
   - (event_id, field, edited_at, edited_by), field = title, start_date, start_time, venue, price, ticket_url, ticket_note, age_limit, genre, flags, event_hashtags…
   - Re-gathers and regenerations skip any locked field.

5. New columns on `events` (facts copied from source only, all nullable):
   `ticket_url`, `ticket_note`, `age_limit`, `festival`, `genre`, `flags` text[], `event_hashtags` text[], `review_flags` text[], `source_hash`, `approved_at`.
   `events.id` is already stable; re-gathers match on `event_source_id + external_id` (fallback source_url) and update in place.

Existing `description_edited`, `image_edited`, `category_locked` booleans are kept and back-filled into `event_field_edits` (no behaviour change), then read through one helper.

All new tables: owner via `can_manage_topic`, service role for jobs, no anon.

## Migration without breaking feeds

- No profile row = today's behaviour. Eastbourne, Brighton, Lisbon keep rendering exactly as now.
- `eventCaption.ts` stays as the fallback assembler; the new assembler lives in a shared module and is used only when a profile is enabled. Existing caption tests keep passing.
- Lisbon gets a profile row seeded with Mike's template, hashtags, genres, flags and voice rules. Eastbourne gets an en-only profile left switched off.
- No existing event is regenerated or charged until it is (re)approved or the owner taps Regenerate.

## Where it sits in Feed Settings

- **Editorial profile** — a fold in the Events section ("Captions"): languages, template per platform, hashtags, genres, flags, voice.
- **API** — its own fold under Share ("API"): field ticks, live JSON preview, keys.

## How it runs

- On approval or auto-approve: code converts facts deterministically ("20h"→20:00, "2 hours before" a 20:00 start→18:00), sets review flags for missing/ambiguous facts; AI writes synopsis per language (2 sentences, 40–60 words) and suggests genre, flags, event hashtags, extra-facts line, review flags; code assembles captions from fields + template.
- Re-runs only when `source_hash` changes, and only for unlocked fields. 1 credit per event processed, logged in the existing credit ledger.
- Checks: no source sentence reused (n-gram overlap), word count, pt-BR marker list, no "!"/promo words; failures become review flags.
- Golden tests: Gulbenkian Soloists and Family Therapy (Olhares do Mediterrâneo) — exact line order, missing price line omitted, festival as heading, ticket_note conversion.
- Desk Event drawer: captions per platform (edit, one-tap copy), synopses per language, genre/flags, review-flag chips.

## Phase 4 API (outline)

`event_api_settings` (fields chosen) + `feed_api_keys` (hashed, revocable). Public route returns approved events only, stable IDs, `updated_since`, per-field `edited_by_hand`, cached + rate-limited. `ticket_url` sent as-is.

## Risks and spec gaps

- Venue is a single `location` text today; separate venue/address lines rely on the source giving them.
- "Never copies source sentences" is checked automatically, but pt-PT quality still needs a human eye; manual review step stays.
- Age limits and festivals are rarely structured in sources; many will be flags rather than lines.
- Captions can't be fully fact-safe if the source itself is wrong; we copy, not verify.
- Phase 3 (Brighton bleed, category steering) must land before Phase 4, as agreed.

## Estimates

- Phase 1 (profile, locks, storage, settings fold): 1.5–2 days
- Phase 2 (writer, assembler, golden tests, Desk UI): 2–3 days
- Phase 3 (Brighton bleed + category steering): 1–2 days, after its own plan
- Phase 4 (API, picker, keys, preview): 1.5–2 days
- Phase 5 (server still + MP4 add-on): later, 2–3 days
