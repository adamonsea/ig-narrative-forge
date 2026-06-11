# Fix RLS & Storage Security Findings

All three findings are database-level (RLS policies). The fix is a single migration. I verified each change against how the app actually reads/writes, so nothing breaks.

## What I verified
- **quiz_responses reads:** The client only ever reads its *own* rows (`useQuizCards.tsx` filters `user_id = userId` for logged-in users). Visitor dedup happens server-side in the `submit-quiz-response` edge function using the service role (bypasses RLS). So tightening the read policy to owner-only is safe.
- **exports bucket:** Private bucket. Reads/writes of carousel files happen server-side (service role). Client code references the `carousel_exports` table, not direct bucket reads.
- **Public buckets:** `story-illustrations`, `audio-briefings`, `visuals`, `templates` are written by edge functions (service role) or the admin-only `IdeogramTestSuite`. `topic-assets` is written client-side by the topic owner to a `{topic_id}/...` path (`OnboardingSettings.tsx`). All other buckets' files are not owner-structured by path.
- Helper functions already exist and are used elsewhere: `has_role(uuid, app_role)` and `user_has_topic_access(uuid, text)`.

## Changes (single migration)

### 1. quiz_responses — fix always-true read
- Drop policy `Users can view their own responses`.
- Recreate SELECT scoped to owner only: `USING (user_id = auth.uid())`.
- Add an admin/owner read path so topic owners can still see aggregate responses if needed: also allow `has_role(auth.uid(),'admin')`.
- Leave the existing insert policy and edge-function flow untouched.

### 2. exports bucket — stop cross-tenant reads
- Drop broad policy `Exports bucket authenticated access` (read) and `Exports bucket authenticated write` (insert).
- Fix the ownership-scoped policies `Users can view their own carousel exports` and `Users can upload their own carousel exports`: replace the buggy `storage.foldername(t.name)` reference with `storage.foldername(objects.name)` so the topic-owner branch actually works.
- Keep the existing `Service role can manage all exports` / `Service role can manage carousel exports` policies so server-side generation keeps working.

### 3. Storage write policies — add ownership checks
- **topic-assets** (path = `{topic_id}/...`): replace the three `auth.role()='authenticated'` write policies (insert/update/delete) with policies requiring `user_has_topic_access((storage.foldername(name))[1]::uuid, 'owner')`. Keeps owner uploads from onboarding working, blocks cross-tenant writes.
- **story-illustrations, audio-briefings, visuals, templates** (not owner-structured by path; written only by edge functions or the admin test suite): replace the broad `authenticated` write policies (insert/update/delete) with `service_role`-only plus `has_role(auth.uid(),'admin')`. This preserves all current write paths (edge functions run as service role; the test suite is admin-only) while blocking ordinary authenticated users.

## Technical notes
- Public buckets remain publicly *readable* (unchanged) — these findings are about writes, not reads, for those buckets. Read access is intentional for displaying illustrations/audio/logos.
- No application/code changes required; this is RLS-only.
- After applying, I'll re-run the security scan and mark the three findings fixed.

## Risks
- Low. The only client-side write to a tightened bucket is topic-assets, which is preserved for topic owners. If any other client-side upload to these buckets surfaces later, it would need the uploader to be the topic owner (topic-assets) or admin/service role (others).
