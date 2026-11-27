import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
import { allowanceDecision, grantAllowsWrites, type OwnerStatus, type WriteKind } from "./allowance";

/** Every tool starts here: signed in, rate limited (60/min), call logged to usage_events as mcp_studio. */
export async function startCall(ctx: ToolContext, tool: string) {
  if (!ctx.isAuthenticated()) throw new ToolError("Please sign in to Curatr first.");
  const db = supabaseForUser(ctx);
  const { data, error } = await db.rpc("mcp_studio_call" as never, { p_tool: tool, p_client_id: ctx.getClientId() ?? "" } as never);
  if (error) throw new ToolError("Curatr couldn't check your account just now. Try again.");
  if (data !== true) throw new ToolError("Too many requests. Wait a minute and try again.");
  return db;
}

/** Phase 2: every write tool calls this once, before doing anything. */
export async function requireAllowance(ctx: ToolContext, db: ReturnType<typeof supabaseForUser>, kind: WriteKind, credits = 1, write?: { tool: string; feedId?: string }) {
  const clientId = ctx.getClientId() ?? "";
  if (write) {
    const { error } = await db.rpc("mcp_studio_write", {
      p_tool: write.tool, p_client_id: clientId, p_topic_id: write.feedId ?? null, p_credits: credits,
    });
    if (error) throw new ToolError(error.message);
    return;
  }
  const { data: grant } = await db.from("mcp_studio_grants" as never).select("version").eq("client_id", clientId).maybeSingle();
  if (!grantAllowsWrites((grant as { version?: number } | null)?.version)) {
    throw new ToolError("This connection can only look at your feeds. To allow changes, disconnect Curatr and connect it again.");
  }
  const { data: status } = await db.rpc("mcp_studio_account" as never);
  const decision = allowanceDecision(status as OwnerStatus | null, kind, credits);
  if (!decision.ok) throw new ToolError(decision.reason);
}
