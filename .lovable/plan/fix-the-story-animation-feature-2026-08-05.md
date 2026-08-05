# Fix the story animation feature

## What we know

- No animation has been produced since 29 June (latest `animation_generated_at` in `stories`).
- The `animate-illustration` edge function has **no logs at all** in the retention window, even though you just tried it. That means requests are being rejected before the function runs, not failing inside it.
- A direct call to the deployed function is rejected at the platform gateway with `401 UNAUTHORIZED_NO_AUTH_HEADER`. The function is configured with `verify_jwt = true` in `supabase/config.toml`, so the gateway validates the token before the code ever boots.
- Two secondary risks are visible in the code but unconfirmed as the cause: the Replicate model version hashes are hardcoded (they go stale when a model is re-published), and the function waits up to 60s at Replicate plus polls for another 90s, which can exceed the function's wall clock.

The gateway rejection is the confirmed blocker. The other two only become visible once calls reach the function again.

## Plan

1. **Move auth into the function (fixes the 401).**
   Set `verify_jwt = false` for `animate-illustration` and validate the caller inside the function using the existing shared helper (`supabase/functions/_shared/auth.ts`), the same pattern as the already-hardened functions. Behaviour is unchanged for legitimate users: a missing or invalid token still returns 401 — but from our code, with a log line, instead of silently at the gateway.

2. **Surface the real error in the UI.**
   In the three callers (`MultiTenantStoriesList`, `PublishedStoriesList`, `ApprovedStoriesPanel`), show the message returned by the function in the error toast instead of a generic "failed". Today every failure looks identical.

3. **Stop hardcoding the Replicate model version.**
   Resolve the current version for the Wan 2.2 i2v standard and fast models at call time from Replicate's model endpoint (cached per boot), with the existing hashes as fallback. This removes a class of silent 422 failures.

4. **Make long renders survive the function timeout.**
   Drop the blocking `Prefer: wait=60` header, keep only the poll loop, and extend it to ~4 minutes with a clear timeout message so a slow render reports honestly instead of failing anonymously.

5. **Verify end to end.**
   Deploy, animate one story from the pipeline, and confirm the logs show the full path (auth → prompt → Replicate → upload) and the video appears on the story.

## Technical notes

- No database schema changes and no credit-logic changes. Credits are still deducted only for non-superadmin callers, and only after auth succeeds.
- `_shared/auth.ts` already provides the JWT-validation helper, so step 1 reuses existing code rather than adding a new auth path.
- Step 3 adds one extra Replicate API call per cold boot, cached thereafter.