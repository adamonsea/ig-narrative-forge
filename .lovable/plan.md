# Feeds in ChatGPT and Claude (premium add-on)

Give every feed owner the option to publish their feed as a connector that AI assistants (ChatGPT, Claude, Cursor, and anything else that speaks MCP) can read directly. It sits alongside the existing website, RSS and widget outputs as a fourth distribution channel.

## What the feed owner gets

In **Distribution**, a new "AI assistants" panel:

- A single switch to turn the connector on (only visible when the add-on is switched on for that owner).
- Access choice: **Open** (any assistant can read the feed, like the public site) or **Key required** (owner generates a key, shares it with whoever they choose, can revoke and regenerate).
- The connection address plus copy-paste instructions for ChatGPT and Claude.
- A quiet usage line: how many times assistants read the feed in the last 7 days.

## What an assistant can do with a feed

Four read-only abilities, all restricted to published stories of that one feed:

1. **Latest stories** — recent published stories with headline, summary, date, publication and link.
2. **Search the feed** — find stories by words or subject.
3. **Read a story** — the full story text with its source attribution and link.
4. **Feed briefing** — a short digest of the last day or week.

Every result carries the original publication name and a link back, matching the attribution rules used in the widget and RSS. Nothing an assistant can do writes to a feed or touches unpublished material.

## Turning it on and charging for it

There is no payment system in the project today, so this ships as a manually granted add-on: an entitlement flag per owner that only the product owner (adamonsea@gmail.com) can set. Owners without it don't see the panel; owners with it get the full feature. Payments can be layered on later without changing anything built here.

## Home page

Add it to the home page as a power feature — a short section positioned around the existing distribution messaging: your feed, answerable inside ChatGPT and Claude, with your sources credited. Copy and placement follow the existing home page style; no layout redesign.

## Technical notes

New edge function `mcp-feed`, serving MCP Streamable HTTP (JSON-RPC over POST) at `/functions/v1/mcp-feed/<slug>`:

- Handles `initialize`, `tools/list`, `tools/call`; responds with `Content-Type: application/json`; accepts the `Accept: application/json, text/event-stream` header assistants send.
- Tools: `list_latest_stories`, `search_stories`, `get_story`, `feed_briefing`. Inputs validated with Zod, limits capped (max 25 stories per call, max query length).
- Reads through the existing published-story paths (`get_public_topic_feed` / published `stories` joined to `topic_articles`), service-role client, published-only filters enforced server-side.
- Auth: when the feed is key-protected, require `Authorization: Bearer <key>`; keys stored hashed (SHA-256), compared constant-time. Open feeds skip auth but still rate-limit by IP using the existing `rate_limits` table.
- CORS and origin handling copied from the hardened edge-function pattern; generic error bodies, no internal detail leaked.

Schema migration:

- `topics.mcp_enabled boolean not null default false`, `topics.mcp_access text not null default 'key'` (`'open' | 'key'`).
- `topic_mcp_keys` (id, topic_id, key_hash, key_prefix, label, created_at, last_used_at, revoked_at) with grants, RLS scoped to topic owner, plus `service_role` full access.
- `mcp_entitlements` (user_id, granted_at, granted_by, notes) with RLS allowing the owner to read their own row and only admins to write.
- Usage counted into the existing `api_usage` table with a `channel = 'mcp'` marker so the panel can show the 7-day number.

Frontend:

- `src/components/topics/AiAssistantAccess.tsx` — the Distribution panel (switch, access choice, key generate/revoke, connection instructions, usage line). Silent autosave, no success toasts, matching the editorial control centre patterns.
- Wired into the Distribution section of `EditorialControlCenter`; entitlement checked on load.
- Small admin control on the product-owner surface to grant/revoke the add-on per owner.
- Home page section added to the existing marketing page.

No changes to scoring, gathering, publishing or any existing channel.
