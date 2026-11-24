# Lisboa List: running cost estimate (discussion only, no code changes)

These are estimates at public list prices (USD), not measured costs. They assume one AI call per event that covers synopsis, PT-PT/EN translation and caption, plus a cheap classification call.

| Step | Per event | 500/mo | 1,000/mo |
|---|---|---|---|
| 1. Gathering/scraping (JSON/iCal reads, no paid scraper) | ~$0.001 | $0.50 | $1 |
| 2. 2-sentence synopsis | ~$0.001 | $0.50 | $1 |
| 3. Translation PT-PT + EN (same call) | ~$0.002 | $1 | $2 |
| 4. Genre/flags/tags, fact checks, review flags (rules first, small model) | ~$0.0005 | $0.25 | $0.50 |
| 5. Bilingual social caption | ~$0.002 | $1 | $2 |
| 6a. Video in browser (today) | $0 | $0 | $0 |
| 6b. Video on a server (automated) | ~$0.01–0.02 | $5–10 | $10–20 |
| 7. Storage + bandwidth (poster + 5s MP4, deleted after event) | ~$0.002 | $1 | $2 |
| 8. API feed to site/scheduler (cached JSON) | ~$0.0002 | $0.10 | $0.20 |
| **Total, browser video** | **~$0.009** | **~$4.50** | **~$9** |
| **Total, server video** | **~$0.02–0.03** | **~$10–15** | **~$20–30** |

Allow about 2x for retries, re-edits and a better model for Portuguese: roughly $30 at 500 and $60 at 1,000 per month in the worst case.

## Video today
The poster and 5-second motion are drawn by the reader's own browser and recorded there as PNG/MP4. Our servers only send the event data and photo, so the cost is practically zero. Automating it means running that same drawing on a server (a headless browser), which costs compute time per video.

## Models, caching, batching
- Gemini 2.5 Flash for synopsis and captions. Test Gemini 2.5 Pro or GPT-5 for European Portuguese (about 4x the cost, still under $0.01 per event) and keep it if Mike notices a quality difference.
- Caching: reusing the shared instructions cuts input cost by about 75%. The biggest saving is skipping events whose source data hasn't changed.
- Batching: about 50% off, but results can take up to 24 hours. Fine for events weeks away, not for same-day ones.

## Suggested price
- Manual in-browser creation: free on any plan.
- Automation add-on: $49/month including 500 event credits, or $89/month including 1,000. Top-ups $10 per 100.
- Costs stay below $30/$60 even in the worst case, which leaves a margin of about 40% at worst and over 70% normally.

## Credits per feed
- 1 credit = one event fully processed (synopsis, translation, tags, caption, server video) and delivered to the API.
- Reprocessing an unchanged event costs nothing. A changed source or an owner-requested rerun costs 1 credit.
- Every use is a ledger row (feed, event ID, action, credits, time) in the existing credit ledger. The feed's monthly allowance is used first, then top-ups. The Desk shows "credits left this month".
