# Studio MCP, Phase 2: set up a feed by chatting

## Two notes from Phase 1

**"Not Found" at about 16:27 (cause not confirmed).** The live logs show the last Studio connector call at 16:25:17 (three calls, all 200). Nothing reached curatr.pro/studio/mcp after that, and there are no 404s from the connector address. So the error didn't come from Curatr: not a route change, and not your disconnect (a disconnect gives "sign in again", not "Not Found"). The approval list shows Claude connected four times between 16:03 and 16:24, so most likely the Claude chat was still holding an older connection after you reconnected. First step of the build: reproduce it (one connection, wait 10 minutes, call again) and tidy up the duplicate approvals.

**Lisbon shows green with no stories.** The health check judges every feed by "last new story", so an events-only feed with no stories never goes red for that reason. Fix: feeds that run on events are judged on the last new event instead, and their sources are checked as event sources. Same green/amber/red rules, one health check.

## What the owner gets

In Claude: "Make me a Pokémon news feed for young fans" gives back a finished private feed (name, sources, look, first stories gathering) and a preview link. The owner checks it in Curatr and presses Publish there. Claude never publishes.

## Tools (all need the level-2 approval and `requireAllowance`)

| Tool | Input | Does | Charges |
|---|---|---|---|
| `draft_feed` | description, name?, area? | Runs the app's own new-feed setup: suggestion, news sources, event sources if relevant, starts the first gather. Feed is created **private**. | Same as the app (setup is free; pictures use credits) |
| `update_sources` | feed_id, add? (links), remove? (source ids) | Checks each link first with the existing source checker (news or what's-on, name, working or not), then adds or removes it | none |
| `set_branding` | feed_id, name?, logo_url?, colours? (top bar, background, brand) | Writes only the existing Look settings, through the same save used by Settings | none |
| `pin_stories` | feed_id, story_ids? or add_story? { link or text } | Pins the feed's own stories (existing pin rules: one pin, 24h/2d/7d), or adds a story through the existing Add story flow | Add story: 1 credit, same as the app |
| `get_preview` | feed_id | Private preview link, plus a short summary: sources, stories, events, look | none |

No publish tool. The Phase 1 tools stay as they are.

## Reusing the app, not copying it

- The feed-creation steps now live inside the Create feed window. They move into one shared setup function that takes "who is calling". The Create feed window and `draft_feed` both call it, so they can't drift apart.
- Setup still runs through the existing services (feed suggestion, source finder, what's-on finder, source checker, Add story), called as the signed-in owner. No new copy of any of them.
- Branding and pins call the same saves as Settings and the Desk.

## Private drafts and the paywall

- `draft_feed` creates the feed private. Going live only happens through Curatr's existing Publish switch, which already holds the paywall.
- The preview link only works for the signed-in owner (the feed's own page for its owner while private).

## Limits, credits and plain messages

- Free limits apply exactly as in the app: number of feeds, sources, pictures. The same checks run (they live in the database and the shared rules).
- When a limit is hit, or credits run out, the tool gives one line plus a link, for example: "Free accounts have one feed. Upgrade: curatr.pro/pricing" or "Out of picture credits. Top up: curatr.pro/settings/usage".
- Rate limits: all tools 60 a minute (as now); write tools 30 an hour; `draft_feed` 5 a day per account.
- Every write is logged to usage_events as mcp_studio, with the feed. Every tool first checks the caller manages that feed and refuses anything else.

## Approval level 2

- When write tools ship, the consent page records level 2. Apps approved at level 1 get one line, "To allow changes, disconnect Curatr and connect it again", until the owner approves again.

## Handing a demo feed to a prospect (simplest way)

- You make the feed in your own account as normal.
- In Curatr you press "Hand over" on that feed (admin only) and get a one-time link, valid for 7 days.
- The prospect opens it, signs in or signs up, and the feed moves to their account (sources, look, stories, pins). The link then stops working. Their plan's limits apply from then on.
- No email lookups and no copying data.

## Risks

- `draft_feed` takes time (finding sources can take 20 to 40 seconds). It reports progress, returns once the feed and sources exist, and leaves story gathering running in Curatr.
- Today, feeds made in the app start public. Drafts from Claude will start private. This doesn't change how the app's Create feed works.
- Moving the setup steps out of the Create feed window touches a key flow. It is covered by the existing "new feed saves its news sources" check.
- Tool wording follows the language rules: you approve, sources credited, British spelling, nothing AI-first.

## End-to-end test

1. Reconnect Claude as amd@lindoneast.com and approve the new level.
2. One message: "Make a Pokémon news feed for young fans." Expect a private feed, 5 or more sources and a preview link.
3. Tweak it: add one source, remove one, set colours and logo, pin a story, add one story from a link.
4. `get_preview` summary matches what Curatr shows.
5. Signed out, the feed doesn't show.
6. Limits: with credits at 0, a picture request gives the top-up line. A second feed on Free gives the upgrade line. Both happen inside a test that is undone straight after.
7. In Curatr, press Publish: the paywall shows for a free account. As Pro, the feed goes live.
8. Hand over: test the hand-over link on a test feed in your account.
9. Feed check, test suite, and new tests for the limits and the hand-over rules.

## Technical details

- New `src/lib/feedSetup/createFeed.ts` (client-agnostic `createFeedFromDraft(db, draft, { isPublic })`); CreateTopicDialog keeps its UI and calls it with `isPublic: true`.
- Tools in `src/lib/mcp/tools/` (one per file), each `startCall` then `requireAllowance(kind)`; feed ownership via `can_manage_topic`.
- `mcp_studio_call` takes a per-tool limit; draft limit counted from usage_events.
- `compute_feed_health`: events-led feeds use the latest event arrival and event-source health.
- Hand-over: `feed_handover_tokens` (hashed token, topic_id, expires_at, used_at) + `claim_feed_handover(token)` SECURITY DEFINER that moves `topics.created_by`; the create step is admin-guarded.
- Consent page records `STUDIO_WRITE_VERSION` (2).
