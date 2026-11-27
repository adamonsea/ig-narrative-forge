# Studio Phase 2

## Connection failure at 16:27, 26 November
The available live logs showed successful POSTs at 16:25 and no matching later request. That is not proof that the error happened outside Curatr: the capture may be incomplete. The SDK uses a stateless transport, so there is no server-side MCP session to expire. No connections were revoked and no routes changed. A stale/disconnected Claude connector is plausible but unconfirmed. To diagnose, reconnect once, call a tool again after ten minutes and record the exact time; check the live request/auth logs then. Claude-side testing is not available in this sandbox.

## Tools
The five additional tools require an explicitly approved version-2 grant. `draft_feed` uses the same feed preparation/source creation as onboarding and creates a private feed. Existing suggestion services meter setup and source searches at one credit each (event source search is another credit); these charges remain in shadow mode while billing enforcement is off. No new source cap is invented: the current database/app gates apply.

Initial gathering is queued on the existing `topic_automation_settings.next_run_at` schedule. It is not a new background-job system and the tool must not claim stories have arrived until `get_preview` reads them. Existing automation finishes the work. Add story uses the existing read/commit service, then the same automation queue. Pinning calls `set_story_pin`, with the app's durations and server checks; it never makes a feed public.

`get_preview` returns the owner's `/studio/preview/{slug}` link, counts and latest rows. The preview uses the normal feed display with private-table reads under RLS. It does not use or write the public feed cache. Private channels are disabled initially; Publish calls the same `set_topic_distribution` gate as the Desk. No publish MCP tool exists.

## Hand-over
An administrator can create a link only for their own private demo. A signed-in recipient explicitly accepts it. The hashed link expires after seven days; acceptance is locked and invalidates all outstanding links for that feed. Free recipient limits apply. Feed ownership moves, rather than copying stories. Recipient controls the feed from then on; administrator powers are unchanged.

## Verification still requiring the owner
After republishing, reconnect Claude to approve level 2. Make a Pokémon draft, change a source and its look, pin a ready story, add a link, inspect the private preview and try Publish in Curatr. Verify the paywall as a Free owner. No real feed should be published for testing without explicit permission. Repeat a tool call after ten minutes to investigate the earlier Not Found.

## Verified in this turn
83 tests passed. Manifest contains eight tools. Signed-out preview and hand-over links redirect to sign-in, and anonymous Studio requests return 401 with an auth challenge. Transactional checks using the real owner confirmed level-1 rejection, zero-credit refusal, caller isolation, private draft persistence, five-draft/day and thirty-write/hour limits, and one-use seven-day hand-over. All fixtures rolled back. A legacy trigger that forced every active feed public was corrected: gathering no longer changes publication.

Feed smoke: 14/15. Lisbon currently has 31 upcoming published events and zero stored photos among them, so the picture assertion cannot pass. Its photo setting remains on; no photos or settings were changed. Signed-in preview/Publish and Claude end-to-end remain unverified because this user-managed backend cannot mint a sandbox session.

Security review: the five new SECURITY DEFINER endpoints intentionally remain callable by signed-in users and guard identity/ownership before access. Their advisory flags reflect that intentional design; 195 earlier findings were not addressed. No service-role client is used by Studio. No new service was enabled. Existing Supabase OAuth remains in use.
