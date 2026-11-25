# Roadmap — Editorial profile / Lisboa List
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
