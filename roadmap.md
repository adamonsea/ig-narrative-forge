# Roadmap — Editorial profile / Lisboa List
- [x] Lightweight cookie choices: balanced one-tap actions, inline Customise, existing regional tracking gates retained.
- [x] Phase 1 storage (profiles, event copy, captions, field locks, new event fields)
- [x] Caption assembler + fact conversions + lock merge (pure, tested)
- [x] Editorial profile fold in Feed Settings + Lisbon seed
- [x] Synopsis writer on approval (1 credit) + Desk drawer UI
- [x] Golden tests from Mike's two worked examples (needs his exact expected captions)
- [x] Add English subtitle (event_copy kind subtitle) + raw source tags (events.source_tags)
- [x] Gatherers fill source_tags verbatim
- [ ] Phase 3 Brighton bleed + category steering
- [ ] Phase 4 API
- [ ] Lisbon source reads Agenda LX English pages: headings arrive in English, not the official Portuguese title

- [x] Multi-day events: date range only in captions/synopsis/API; feed, cards, What's on, calendar links, widgets, ordering unchanged (confirm in report)
- [ ] Clean up old per-day duplicate copies of long-running Lisbon events (pre stable-key). Never delete rows readers or owners touched (impressions, clicks, edits, approvals); no deletion by time window; tests only via zztest_ visitor IDs.
- [ ] Phase 3: Brighton bleed + category steering — plan shown, waiting for Adam's go.
- [ ] Feed API: stories and pins resources (same envelope)

# Phase 0 — billing shadow mode
- [x] api_usage payer/feed columns, usage_events meter, billing_exempt (Adam), flags off
- [x] Pictures, animation, rewrite, suggestions, event copy metered; Pro 1,000 credits
- [x] Gate checks in schedulers, Desk pause line, Usage page, admin view, trial/Pro-only gates (asleep until enforcement)
- [ ] Free-feed private preview link (needs feed reads to accept a preview token)
- [ ] Custom domain and social automation gates (features don't exist yet)
- [ ] Decide Autopilot picture price once real measured costs are in
- [ ] Fresh free-account test with amd@lindoneast.com — not yet an account; waiting on Adam to sign up and confirm the email

## Future channels (not building yet)
Next up after Phase 0 and the reliability sprint: 1 and 2. Keep Curatr's core modular so these can plug in.

- [ ] 1. Calendar subscriptions — a feed's events as a subscribable iCal feed (Google/Apple), auto-updating.
- [ ] 2. WhatsApp and Telegram channels — daily/weekly digest broadcast.
- [ ] 3. AI answer engines — be the cited source in Google AI answers/Perplexity: structured story pages (schema.org NewsArticle/Event), clear source credit.
- [ ] 4. Venue screens — a full-screen, auto-rotating feed display for cafés, libraries, receptions.
- [ ] 5. Slack, Teams and Discord bots — post a feed into a channel (organisation "own channel" and niche communities).
- [ ] 6. Weekly print one-pager — auto-generated PDF of the week's top stories and events.

Parked: audio briefings (already parked).

## Reliability sprint
- [x] New feed saves its news sources (finder retries, typed website kept, smoke check)
- [ ] Pokémon Junior test feed still has no news sources — waiting on Adam to add them
- [ ] auto-illustrate-stories fails on a missing stories.summary column (seen in logs)
- [ ] Fix double picture drawing/charging when two picture jobs run on the same story at once (waiting on Adam's go-ahead)
- [x] Feed loading screen uses the feed's own logo size and type (correction)

## Studio MCP Phase 1 (approved 26 Nov)
- [x] /mcp Studio server with OAuth (Supabase), consent screen (quartered mark), Connected apps in Account settings
- [x] Tools list_feeds, get_account, get_feed_health; rate limit; usage_events 'mcp_studio'
- [x] requireAllowance(ctx) helper for Phase 2; grant version re-consent design
- [x] Check loading screen on screen (Eastbourne, Lisbon, embed, 0.4s delay); list what the next publish includes

## Studio MCP Phase 2
- [ ] Reproduce intermittent Claude Not Found: blocked on Adam repeating the live Claude call; logs lack the failed request, transport is stateless, no connections revoked
- [x] Events-led health uses events through feed_health
- [x] Shared setup + five level-2 tools; private drafts, existing caps/charges, write limits and logging
- [x] Private preview and Curatr-only Publish
- [x] Admin demo hand-over, one-time 7-day link and recipient limits
- [x] 83 tests, transactional owner/privacy/credit/hand-over checks and eight-tool manifest
- [ ] Signed-in preview and Claude end-to-end: blocked on owner republish/reconnect; session minting unavailable on user-managed Supabase
- [ ] Feed smoke picture check: 14/15, Lisbon has zero upcoming events with stored photos (31 upcoming events); no picture/settings changes made

## Writing settings simplification
- [x] Shared feed length: Brief (3), Standard (5), In-depth (7); retain extended and per-story overrides
- [x] Writing page: length + house style; existing audience, tone, format and examples in Advanced
- [x] Wire Autopilot, Add story and Desk; 98 tests passed, feed smoke 14/15 (existing Lisbon picture gap); not published
- [ ] Signed-in Writing save/read-back and live new-summary check: blocked on unavailable sandbox owner session; settings-save tests use a scoped mock, not a live account

## Later: owner sources
- [ ] Owner sources (claimed or verified): let a feed's own blog, press releases or original reporting run longer (In-depth/Extended) and carry its own closing call to action. Guide with nudges and where settings sit, not hard locks. Not building yet.
