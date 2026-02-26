

## Security Hardening: Internal Edge Functions — COMPLETED

### What was done

**Phase 2 (Cron Migration) — ✅ Complete**
- 11 pg_cron jobs switched from anon key to service_role key via SQL Editor
- Jobs: process-content-generation-queue, auto-simplify-queue-cron, automated-scraper (x3), drip-feed-scheduler, generate-insight-cards-3x-daily, sentiment-card-daily-generation, reddit-community-intelligence-daily, topic-automation-hourly, universal-topic-automation-every-2-hours

**Phase 1 (Service-Role Gate) — ✅ Complete**
- 8 edge functions now validate JWT role before processing

**Internal-only (service_role required):**
- `auto-simplify-queue`
- `insight-card-scheduler`
- `sentiment-card-scheduler`
- `topic-automation-monitor`

**Mixed (service_role OR authenticated user):**
- `queue-processor` (also called from QueueManager UI)
- `automated-scheduler` (also called from ScheduleMonitor UI)
- `drip-feed-scheduler` (also called from DripFeedSettings, PublishedStoriesList)
- `reddit-community-scheduler` (also called from CommunityVoiceSettings)

**Already protected (verify_jwt = true in config.toml):**
- `schedule-recovery`
- `automated-event-scheduler`

### How the check works
The JWT payload is base64-decoded and the `role` claim is checked:
- `service_role` → allowed (cron jobs, internal function-to-function calls)
- `authenticated` → allowed for mixed functions only (logged-in dashboard users)
- `anon` or missing → rejected with 403

### Remaining work (Phase 3)
- Add JWT + topic ownership validation to admin-facing browser functions (promote-topic-article, suggest-content-sources, ai-event-generator)
- Add Zod input validation to high-risk functions (enhanced-content-generator, universal-scraper, content-extractor)

### Known pre-existing issue
Postgres logs show `invalid input syntax for type uuid: "service-role"` — a function is using the string `"service-role"` as a user ID in a UUID column. Needs separate investigation.
