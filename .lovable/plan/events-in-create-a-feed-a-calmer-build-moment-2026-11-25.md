# Events in create-a-feed + a calmer build moment

## How event sources are stored today
- Table `event_sources` (one row per feed + address, unique on `topic_id,url`), with `kind` (`whats_on_page`, `calendar_feed`, `ticket_shop`…), `method`, `is_active`, `auto_publish`, `last_event_count`.
- Rows are only ever written by the `scrape-whats-on` function's `save` action: it detects the kind, reads the page with the registered reader, scores events for the feed, upserts the source and stores its events (location rules, Hidden for out of area). Photos follow in the background.
- `topics.events_enabled = true` already fires a trigger that switches on "Show in the feed" (`events_cards_enabled`).
- Onboarding will call that same `save` action per chosen event source after the feed exists. No new table, no second write path.

## Part 1 — Events in onboarding
1. About step: one switch under the input, "Include what's on".
   - Quick guess while typing (place-like words: a known town/city shape, "local", "in X") sets it on; niche topics off.
   - When `suggest-feed-setup` returns `topic_type`, regional → on, otherwise off.
   - Once the owner flips it, auto-setting stops.
2. New action `find` on `scrape-whats-on` (keeps every events rule in one module, per AGENTS.md): input name, region, keywords, topic type. Searches for what's-on pages, venue/council/Chamber calendars and ticket shops (existing `discoveryQueries` + Firecrawl search), drops social hosts, quickly checks each candidate with the existing kind detection, and returns only addresses that actually have upcoming events (with a count and 1–2 sample event titles/dates). Same quality bar as `rankSources`: confidence ≥ 60, blocked hosts, top 3 ticked.
   - Metered as 1 suggestion credit through `meterUsage`, like `suggest-content-sources`; skip/pause rules from Phase 0 apply.
3. Called in parallel with `suggest-content-sources` (Promise.allSettled) — no extra wait; news never waits on events failing.
4. "What's on" appears only if at least one event source came back. Otherwise the flow is exactly as today.
5. Preview (`FeedSetupPreview`): a small "What's on" group under news sources, same chips, same tap-to-include.
6. On "Looks good": after news sources are saved, if any event sources are ticked, set `topics.events_enabled = true` and call `scrape-whats-on` `save` for each (parallel, failures counted like news failures). If none ticked or the switch is off, nothing about events changes.
7. MCP: `mcp-feed` is read-only and cannot create feeds today, so there is no chat-to-feed path to cap. If one is added later it must call these same functions so caps apply.

## Part 2 — The two waits
### Finding sources ("thinking" / "sources" steps)
- Title "Finding sources for {name}" (Instrument Serif), thin sweep line (fills solid pop when done).
- Chips land under "News" and "What's on" as results arrive; if a batch arrives at once, revealed ~520ms apart, news and events interleaved. Ends "{n} sources found", then moves to Preview.
- Radar, rotating messages and skeleton chips removed.

### Building (`FeedBuildProgress`)
- One phone-framed preview of their feed in its own colours (`feedSurfaces`/`feedBrandPalette`):
  - Header with feed name and one dot per source, lit as each source connects (real `content_sources`/`event_sources` state).
  - "What's on" row: real event cards (date + title) from `events` for the topic as they're stored.
  - "Latest": real stories dropped in at the top as each is written (headline + source; illustration if present, colour block if not).
- Status line under the phone, from real progress: Connecting {n} sources → Finding what's on (only with events) → Writing your first stories → Your feed is live. `aria-live="polite"`.
- End: Live pill, then the existing See your feed / Open the Desk buttons. The separate "done" screen is removed; error/partial notes stay as one inline line.
- Removed: ClippingStackLoop, encouraging messages, progress bar, checklist, "Stories found" list.
- Polling as today (same queries, same timeout), plus one events query.
- Reduced motion: final states shown, no motion.
- Type: titles 44–52px serif, body 18–20px, nothing under 13px. Motion ported as tokens/keyframes in `src/styles.css` (land, slide, drop, sweep, fade-rise); added to /design first.

## Files touched
- `src/components/CreateTopicDialog.tsx` — switch, parallel find, event save, step rendering, remove done screen.
- `src/components/feed-setup/FeedSetupPreview.tsx` — What's on group.
- `src/components/feed-setup/FindingSources.tsx` (new) — chips + sweep.
- `src/components/FeedBuildProgress.tsx` — rebuilt as phone preview.
- `src/components/feed-setup/FeedAssemblyPhone.tsx` (new).
- `src/lib/feedSetup.ts` — place guess + event ranking (pure, tested).
- `supabase/functions/scrape-whats-on/index.ts` + `find.ts` (new) — find action.
- `src/styles.css`, design page — motion tokens.
- Tests: place guess, event ranking, "no What's on when none found".

## Risks to the existing flow
- Event `save` reads pages and can be slow: run it after the feed and news sources exist, not blocking the build; build progress just shows events as they arrive.
- Removing the done screen changes where the two buttons live; same handlers kept.
- `find` adds Firecrawl search cost per new feed; one credit is metered. Search failures return an empty list, never an error.
- Hand-built path (name → sources) gets the same finder but no switch logic changes beyond defaulting.
- Nothing else in Desk, Sources or feed changes.
