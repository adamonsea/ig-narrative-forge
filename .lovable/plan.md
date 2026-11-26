# Studio MCP, Phase 1: owners connect Claude and see their feeds

## Route chosen and why
- **Sign-in server: Supabase Auth's built-in OAuth 2.1 server** (PKCE, dynamic client registration, consent hand-off, token refresh, revocation). Checked today: this project's discovery endpoint answers `feature_disabled`. That is expected before publish; publishing with the Supabase connection healthy switches it on (OAuth 2.1 + DCR, consent path `/.lovable/oauth/consent`, Site URL synced). No home-made token store, so the smallest safe option.
- **Server location: deviation from the brief, recommended.** Host Studio MCP inside the app at `https://curatr.pro/mcp` (TanStack server route built with `@lovable.dev/mcp-js`), not a new edge function. The SDK does Streamable HTTP, token checks (issuer, audience, `client_id` claim so copied browser sessions are refused) and the protected-resource metadata Claude needs. The old "pretty /mcp is impossible" note applied to proxying; a real app route now works. Reader `mcp-feed` stays untouched on its Supabase URL. If you'd rather keep an edge function `mcp-studio`, I'd hand-write the same checks and metadata; more code, same result.

## Endpoints
```text
https://curatr.pro/mcp                                  Studio MCP (POST, Streamable HTTP)
https://curatr.pro/.well-known/oauth-protected-resource  points Claude at the sign-in server
https://fpoywkjgdapgjtdeooak.supabase.co/auth/v1/...    authorize, token, register, revoke (Supabase)
https://curatr.pro/.lovable/oauth/consent               consent screen
```

## Consent screen
- Workspace style, one card: feed favicon-free Curatr mark, "Allow {client} to see and manage your Curatr feeds", signed-in email, **Allow** (primary) / **Cancel**.
- Signed out: goes to the existing sign-in (password and Google) and returns to the same consent link (safe same-site return check). Errors inline, one sentence. Already-approved clients pass straight through.

## Tokens
- Issued, stored and hashed by Supabase Auth. Access token about 1 hour, refresh rotates. Nothing stored by Curatr.
- **Account settings → Connected apps**: list of approved clients (name, date) with **Disconnect**, using Supabase's grant list/revoke calls. Revoke kills refresh; access tokens end within the hour.

## Tools (read-only, all with readOnlyHint)
- `list_feeds()` → `[{ id, name, slug, public_url, plan, autopilot, sources_count, stories_this_week }]`, only feeds where `can_manage_topic` is true.
- `get_account()` → `{ plan, credits_left, stories_used_this_month, story_allowance, trial: { active, ends_at, stories_left } }` from the existing allowance helpers.
- `get_feed_health({ feed_id? })` → per feed `{ last_story_at, failing_sources[], paused_reasons[] }` from `get_feed_health` / feed_health (guarded).
- Server instructions (draft): "Curatr brings the highlights from your chosen sources into one feed, credited and in your voice. You stay in charge: these tools let you see your feeds, their health and your account. Nothing goes live without your say." British spelling, no AI wording.

## Safety rules
- Every query uses a Supabase client carrying the caller's token, so RLS and `can_manage_topic` apply. No service-role key anywhere in the MCP code (avoids the isServiceRole billing bug class).
- Rate limit: 60 calls/minute per user via existing `rate_limits` pattern (guarded RPC). Each call logged to `usage_events` with source `mcp_studio`, tool name, user, no inputs or tokens.
- **Phase 2 Pro gate, designed now:** one helper `requirePro(ctx)` reading the plan from the guarded allowance RPC; write tools call it first and return "This needs Curatr Pro" with the upgrade link. Phase 1 tools skip it, so Free and Pro both work.

## Risks
- OAuth only switches on at publish; can't fully test before. If discovery still fails after publish, you reconnect Supabase or enable OAuth 2.1/DCR in its auth settings.
- Supabase's OAuth server is new; edge cases (client names, consent API) may shift.
- Tokens carry no scopes, so "read vs write" is enforced by tools and the Pro gate, not by the token.
- Google sign-in return must keep the consent link; I'll add the consent URL to Supabase redirect URLs (you add it in the dashboard if needed).

## Proof, end to end
1. Before publish: manifest extraction, unit tests for the return-path check and Pro gate, SQL check that tools as the Pokémon owner see only that feed.
2. After you publish: discovery endpoint returns JSON with issuer.
3. In Claude: Settings → Connectors → Add custom connector → `https://curatr.pro/mcp` → sign in as amd@lindoneast.com → Allow → ask "list my feeds" (only Pokémon), "my account", "feed health". Check usage_events rows. Cancel path and Disconnect in Account settings both tested; after Disconnect, Claude must ask to sign in again.
4. Repeat sign-in with Adam's account to confirm multi-feed listing. After-change check run. Nothing published by me.
