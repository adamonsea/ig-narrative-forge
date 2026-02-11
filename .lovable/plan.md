

## Fix Manual Content Staging + Build Errors

Two issues need fixing: the Manual Content Staging feature is stuck at "Extracting content..." and there are unrelated build errors blocking compilation.

---

### Issue 1: Build Errors (TypeScript)

`src/hooks/usePushSubscription.tsx` has TypeScript errors where `pushManager` is not recognized on `ServiceWorkerRegistration`. This is a missing type declaration issue.

**Fix:** Add a type assertion or augment the ServiceWorkerRegistration type to include `pushManager`. The simplest approach is casting `registration as any` at the usage sites, or adding a proper Web Push API type declaration file.

---

### Issue 2: Manual Content Staging Stuck at "Extracting content..."

The file upload reaches "Extracting content..." status but never completes. No logs appear from the `extract-content-from-upload` edge function, meaning the function either is not being reached or is silently failing.

**Root causes identified:**

1. **Duplicate useEffect hooks** in `ManualContentStaging.tsx` -- lines 57-76 and lines 228-247 are identical effects that both load from localStorage and try to auto-resume. This can cause double-processing attempts and race conditions with `isProcessingRef`.

2. **Stale closure in processNextFile** -- The `useCallback` depends on `processingFiles`, but `setTimeout(() => processNextFile(), 2000)` in `onDrop` (line 400) may capture a stale reference before state updates propagate.

3. **Edge function may not be deployed** -- Zero logs from `extract-content-from-upload` suggests the function invocation may be failing at the HTTP level (e.g., 500 on boot) or the function has not been deployed recently.

**Fix plan:**

1. **Remove duplicate useEffect** -- Delete the first localStorage load/save effects (lines 57-85) since the second pair (lines 228-256) correctly uses `processNextFileRef`.

2. **Fix stale closure** -- In `onDrop`, use `processNextFileRef.current()` instead of `processNextFile()` to always call the latest version.

3. **Redeploy the edge function** -- Ensure `extract-content-from-upload` is deployed and responding.

4. **Add error visibility** -- If the `supabase.functions.invoke` call returns an HTTP error (e.g., boot failure), the current code may not surface it clearly. Add better logging around the invoke call response.

---

### Implementation Steps

**Step 1: Fix `usePushSubscription.tsx` build errors**
- Add `// @ts-ignore` annotations above `pushManager` usages, or create a type declaration file `src/types/service-worker.d.ts` extending the ServiceWorkerRegistration interface.

**Step 2: Fix `ManualContentStaging.tsx` duplicate effects and stale closures**
- Remove the first pair of useEffect hooks (lines 57-85)
- Change line 400 from `processNextFile()` to `processNextFileRef.current()`
- Keep the second pair of effects (lines 228-256) which correctly reference `processNextFileRef`

**Step 3: Redeploy `extract-content-from-upload` edge function**
- Deploy and verify it boots successfully and responds to requests

**Step 4: Test end-to-end**
- Upload a .txt file through Manual Content Staging
- Verify it progresses past "Extracting content..." to completion
- Confirm the article appears in the arrivals queue

