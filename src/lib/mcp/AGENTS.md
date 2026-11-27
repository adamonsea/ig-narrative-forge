# Studio MCP rules
- Studio MCP (owners) lives in `src/lib/mcp/` at `/studio/mcp` (`/mcp` is the reader connector page; reader `mcp-feed` is separate). Sign-in is Supabase's OAuth server; tools query only as the caller via guarded `mcp_studio_*` RPCs (each starts with `mcp_studio_call`: 60/min, logged to usage_events actor mcp_studio). Write tools must call `requireAllowance()` (`gate.ts`), which needs a grant version ≥ `STUDIO_WRITE_VERSION` in `mcp_studio_grants`; one gate keeps plan rules and re-consent in one place.

- Phase 2 tools use `beginWrite` → `requireAllowance` → guarded `mcp_studio_write`; they act only on caller-owned feeds, reuse `feedSetup/` services, and never expose a publish action. This keeps onboarding and MCP in agreement.
