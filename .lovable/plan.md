

## Risk Assessment: CRON_SECRET Validation for Internal Functions

### The core danger

There are **two calling patterns** that would break if we naively add secret validation:

**1. pg_cron jobs** -- These call functions via `net.http_post` with hardcoded headers. Currently they pass the **anon key** (or service_role key). They do NOT pass any custom secret header. Adding a CRON_SECRET check would require **re-scheduling every cron job** with updated SQL to include the new header. There are 15+ active cron jobs across 34 migration files.

**2. Internal function-to-function calls** -- Functions like `automated-scheduler` call `queue-processor`, `universal-topic-scraper`, `generate-daily-roundup`, etc. via `supabase.functions.invoke()`. This method does NOT support custom headers -- it only passes the Authorization header from the Supabase client. Adding a secret check to any function that's called internally would break the entire automation chain.

### What would actually break

If we add CRON_SECRET validation to `queue-processor`:
- The pg_cron job `process-content-generation-queue` would get rejected (no secret header)
- `automated-scheduler` calling `queue-processor` internally would get rejected
- `test-processing-pipeline` calling it would get rejected
- The QueueManager UI component calling it from the browser would get rejected

This pattern repeats for nearly every internal function. The call graph is deeply interconnected -- 35 edge functions invoke other edge functions, 73 frontend files invoke edge functions.

### Safe approach instead

Rather than CRON_SECRET (which requires coordinated changes across cron SQL, all callers, and all callees), the safe pattern is:

| Protection | Mechanism | Risk |
|---|---|---|
| **Cron/internal functions** | Check for `service_role` in the Authorization header (already used by most internal callers) | Zero breakage -- callers already pass service_role |
| **User-facing admin functions** | Validate JWT via `getClaims()` + topic ownership check | Only affects browser calls, which already send user JWT |
| **Public endpoints** | Rate limiting + Zod validation (already partially done) | No auth change needed |

### Recommended plan

**Phase 1: Service-role gate for internal functions (safe, no cron changes)**

Add a helper that checks if the caller is using the service_role key. If the Authorization header contains the anon key or no key, reject with 403. This works because:
- pg_cron migration `20250905075424` already uses the service_role key for `automated-scheduler`
- Internal `supabase.functions.invoke()` calls already use service_role when the calling function creates its client with `SUPABASE_SERVICE_ROLE_KEY`

Target functions (called only by cron or other functions, never by browser):
- `queue-processor`
- `auto-simplify-queue`
- `schedule-recovery`
- `automated-scheduler`
- `drip-feed-scheduler`
- `insight-card-scheduler`
- `sentiment-card-scheduler`
- `reddit-community-scheduler`
- `automated-event-scheduler`
- `topic-automation-monitor`

**Phase 2: Verify pg_cron headers use service_role (audit only)**

Check which cron jobs use anon key vs service_role. Any using anon key need a migration to switch to service_role BEFORE Phase 1 is deployed, or those cron-triggered runs will break.

**Phase 3: JWT + ownership for admin-facing functions**

Functions called from the browser dashboard (e.g., `promote-topic-article`, `suggest-content-sources`, `ai-event-generator`) should validate the user JWT and check topic ownership.

### Implementation for Phase 1

Create a shared validation snippet used at the top of each internal function:

```typescript
// Validate service-role authorization
const authHeader = req.headers.get('Authorization');
if (!authHeader?.includes('service_role')) {
  // Check if it's actually the service role JWT by decoding
  const token = authHeader?.replace('Bearer ', '');
  const payload = token ? JSON.parse(atob(token.split('.')[1])) : null;
  if (payload?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: internal function' }),
      { status: 403, headers: corsHeaders }
    );
  }
}
```

### Pre-flight check required

Before implementing, I need to verify which pg_cron jobs use anon vs service_role key. The migration `20251124125430` explicitly switched `automated-scheduler` to use the anon key -- which means Phase 1 would **break that cron job** unless we first migrate it back to service_role.

This is exactly the kind of silent breakage the security fix could cause.

### Recommendation

1. First: audit all active cron jobs to confirm which key they use (read-only, no changes)
2. Then: migrate any anon-key cron jobs to service_role (database migration)
3. Then: add service_role checks to internal functions (edge function changes)
4. Separately: add JWT validation to admin-facing browser functions

This ordering guarantees nothing breaks. Each step is independently reversible.

