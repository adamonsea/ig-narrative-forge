# Priority 2: Risk Assessment & Mitigation Plan

## Current State Analysis (Completed 2026-01-29)

---

## 🟢 Issue 1: Function `search_path` Hardening

### Current State
| Function | Has `search_path`? | Status |
|----------|-------------------|--------|
| `get_story_reaction_counts_batch` | ❌ No | **VULNERABLE** |
| `log_error_ticket` | ✅ Yes (`public, extensions`) | Already fixed |

### Risk Assessment
- **Attack Vector**: Schema injection via malicious temp tables
- **Exploitability**: LOW - requires authenticated user + crafted input
- **Impact**: MEDIUM - could manipulate reaction counts or error logging
- **Urgency**: HIGH - simple fix, no behavior change

### Mitigation
**Only 1 function needs fixing** (not 2 as originally estimated):
```sql
-- Fix get_story_reaction_counts_batch
CREATE OR REPLACE FUNCTION public.get_story_reaction_counts_batch(...)
SECURITY DEFINER
SET search_path TO 'public'  -- ADD THIS LINE
AS $function$...
```

### Rollback Plan
- Function can be reverted instantly
- No data migration needed

---

## 🟡 Issue 2: Overly Permissive RLS Policies

### Current State (Tables with `USING (true)`)
| Table | Row Count | Exploitation Risk |
|-------|-----------|-------------------|
| `article_duplicates` | 0 rows | LOW - empty |
| `article_duplicates_pending` | 0 rows | LOW - empty |
| `image_generation_tests` | 0 rows | LOW - empty |
| `quality_reports` | 0 rows | LOW - empty |

### Risk Assessment
- **Attack Vector**: Unauthorized data insertion/manipulation
- **Exploitability**: MEDIUM - any authenticated user could write arbitrary data
- **Impact**: LOW - tables are empty, no sensitive data exposed
- **Urgency**: MEDIUM - should fix before tables accumulate data

### Mitigation Strategy
**Phase 1 (Safe - empty tables):**
1. Create new restrictive policies FIRST
2. Drop old permissive policies SECOND
3. Test with authenticated user

**Phase 2 (Verification):**
- Ensure automated systems (cron, edge functions) still work
- Use service_role for system operations

### Rollback Plan
- Keep old policy names documented
- Can recreate permissive policies if systems break

---

## 🟢 Issue 3: Auth Configuration

### Current State
| Setting | Status | Risk |
|---------|--------|------|
| OTP Expiry | Unknown (likely 3600s) | LOW |
| Leaked Password Protection | Disabled | LOW |

### Risk Assessment
- **Attack Vector**: Brute-force OTP, compromised passwords
- **Exploitability**: LOW - requires targeted attack
- **Impact**: MEDIUM - account takeover possible
- **Urgency**: LOW - configuration change, no code risk

### Mitigation
- Dashboard configuration only
- No code changes needed
- Zero rollback risk

---

## 🟡 Issue 4: Edge Function Authorization

### Current State
**User-Facing Functions (need JWT):**
| Function | Current Auth | Risk Level |
|----------|-------------|------------|
| `suggest-keywords` | None | MEDIUM |
| `suggest-content-sources` | None | MEDIUM |
| `ai-event-generator` | None | MEDIUM |
| `suggest-regional-elements` | None | MEDIUM |

**Internal/Cron Functions (need HMAC):**
| Function | Current Auth | Risk Level |
|----------|-------------|------------|
| `queue-processor` | None | LOW (internal) |
| `universal-topic-scraper` | None | LOW (internal) |
| `sentiment-card-scheduler` | None | LOW (internal) |

### Risk Assessment
- **Attack Vector**: Unauthorized AI calls, resource abuse
- **Exploitability**: MEDIUM - endpoint URLs are discoverable
- **Impact**: 
  - User functions: API cost abuse (DeepSeek calls)
  - Cron functions: Low impact (mostly read operations)
- **Urgency**: MEDIUM - user functions should be protected

### Mitigation Strategy

**Phase 1: User Functions (Priority)**
1. Add JWT verification to all 4 suggest-* functions
2. Add topic ownership check
3. Test with authenticated calls

**Phase 2: Internal Functions (Lower Priority)**
1. Add `INTERNAL_API_SECRET` to secrets
2. Add signature validation to cron functions
3. Allow service_role bypass for pg_cron calls

### Missing Secret
- ❌ `INTERNAL_API_SECRET` not configured
- Need to add before Phase 2

### Rollback Plan
- Can remove auth checks if breaking
- Keep backward-compatible (auth optional initially, then required)

---

## 🟢 Issue 5: Extensions in Public Schema

### Current State
- `pg_trgm` and `pg_net` in public schema

### Risk Assessment
- **Status**: ACCEPTED RISK
- **Reason**: Supabase-managed, moving would break functionality
- **Action**: None required

---

## 🟢 Issue 6: Stories Table RLS

### Current State
| Policy | Command | Status |
|--------|---------|--------|
| `Published stories from public topics are publicly viewable` | SELECT | ✅ Well-designed |
| `stories_manage_optimized` | ALL | ✅ Well-designed |

### Risk Assessment
- **Policies verified as SECURE**:
  - Public SELECT: Only published stories in active public topics
  - Management: Service role OR admin OR topic owner only
  - Uses subquery optimization `(SELECT auth.uid())`
- **Action**: None required

---

## Implementation Order (Risk-Prioritized)

| Order | Fix | Risk Level | Breaking Risk | Rollback Ease |
|-------|-----|------------|---------------|---------------|
| 1 | Function search_path (1 function) | HIGH | ⚪ None | ✅ Instant |
| 2 | Auth config (OTP + password) | LOW | ⚪ None | ✅ Dashboard |
| 3 | User edge function auth | MEDIUM | 🟡 Medium | 🟡 Moderate |
| 4 | RLS policy tightening | LOW | 🟡 Low | ✅ Easy |
| 5 | Internal function HMAC | LOW | 🟡 Medium | 🟡 Moderate |

---

## Dependencies & Blockers

### No Blockers
- All fixes can proceed independently
- Tables are empty, no data migration needed

### Required Secrets
- [ ] `INTERNAL_API_SECRET` - needed for Phase 2 cron hardening

---

## Pre-Implementation Checklist

### Before Starting
- [x] Document current function definitions
- [x] Verify tables are empty (confirmed: 0 rows each)
- [x] Check existing secrets
- [x] Review stories RLS (verified secure)
- [ ] Add `INTERNAL_API_SECRET` to secrets

### Testing Plan
1. **Function fix**: Call `get_story_reaction_counts_batch` from feed
2. **RLS**: Verify non-owner cannot insert into protected tables
3. **Edge auth**: Test with/without JWT token
4. **Cron**: Verify scheduled jobs still execute

---

## Summary

| Issue | Severity | Effort | Recommendation |
|-------|----------|--------|----------------|
| search_path | 🔴 High | 5 min | **Do Now** |
| Auth config | 🟡 Medium | 5 min | **Do Now** |
| Edge auth (user) | 🟡 Medium | 30 min | **Do Soon** |
| RLS tightening | 🟢 Low | 15 min | **Do Soon** |
| Edge auth (cron) | 🟢 Low | 30 min | **Defer** |

**Total estimated effort: ~1.5 hours** (reduced from 2 hours - log_error_ticket already fixed)
