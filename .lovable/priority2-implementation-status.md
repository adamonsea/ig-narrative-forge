# Priority 2 Implementation Status

## ✅ COMPLETED

### 1. Database Function Hardening
- **`get_story_reaction_counts_batch`**: Added `SET search_path = public` to prevent schema injection attacks

### 2. RLS Policy Tightening (4 tables - all empty, zero risk)
- **`article_duplicates`**: Replaced `USING(true)` with service_role-only access
- **`article_duplicates_pending`**: Replaced `USING(true)` with service_role-only access  
- **`image_generation_tests`**: Replaced `USING(true)` with service_role-only access
- **`quality_reports`**: Replaced `USING(true)` with service_role-only access

### 3. Edge Function JWT + Topic Ownership Authorization
All 4 admin-facing edge functions now verify:
1. Valid JWT token via `getClaims()`
2. Topic ownership via `owner_id` check
3. Admin role fallback via `has_role()` RPC

Updated functions:
- **`suggest-keywords`**: ✅ JWT + topic ownership
- **`suggest-content-sources`**: ✅ JWT + topic ownership  
- **`suggest-regional-elements`**: ✅ JWT + topic ownership
- **`ai-event-generator`**: ✅ JWT + topic ownership

## 🔶 MANUAL ACTION REQUIRED

### Auth Configuration (Dashboard)
Navigate to: https://supabase.com/dashboard/project/fpoywkjgdapgjtdeooak/auth/providers

1. **Reduce OTP expiry**: Set to 300-600 seconds (5-10 minutes)
2. **Enable leaked password protection**: Turn on HaveIBeenPwned integration

## 📋 DEFERRED (Requires Secret Setup)

### HMAC Signature Validation for Internal/Cron Functions
**Requires**: Add `INTERNAL_API_SECRET` to Supabase secrets first

Functions to update:
- `queue-processor`
- `universal-topic-scraper`
- `sentiment-history-snapshot`
- `auto-simplify-queue`

Pattern to implement:
```typescript
const expectedSignature = await crypto.subtle.sign(
  { name: 'HMAC', hash: 'SHA-256' },
  key,
  new TextEncoder().encode(JSON.stringify(body))
);
```

## 🔍 Security Linter Warnings

The linter reported 31 warnings for `search_path` on non-SECURITY DEFINER functions. These are lower priority since they don't have elevated privileges. Can be addressed in a future pass.

---
**Last Updated**: 2026-01-29
**Status**: Priority 2 HIGH/MEDIUM items completed
