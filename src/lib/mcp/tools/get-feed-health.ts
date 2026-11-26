import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { startCall } from "../gate";

interface Row { id: string; name: string; slug: string; last_story_at: string | null; health: string | null; health_reason: string | null; owner_action: string | null; broken_sources: number | null }

export default defineTool({
  name: "get_feed_health",
  title: "Feed health",
  description: "Check how your feeds are running: last story, how many sources are failing, and anything that has paused a feed.",
  inputSchema: { feed_id: z.string().uuid().optional().describe("One feed's id from list_feeds. Leave out for all your feeds.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ feed_id }, ctx) => {
    const db = await startCall(ctx, "get_feed_health");
    const { data, error } = await db.rpc("mcp_studio_feeds" as never);
    if (error) throw new ToolError("Couldn't load feed health. Try again.");
    const rows = ((data ?? []) as Row[]).filter((r) => !feed_id || r.id === feed_id);
    if (feed_id && rows.length === 0) throw new ToolError("That feed isn't one you manage.");
    const feeds = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.health ?? "unknown",
      last_story_at: r.last_story_at,
      failing_sources: r.broken_sources ?? 0,
      paused_reasons: [r.health_reason, r.owner_action].filter((x): x is string => !!x),
    }));
    const text = feeds.map((f) => `${f.name}: ${f.status}. Last story ${f.last_story_at?.slice(0, 16).replace("T", " ") ?? "none yet"}. Failing sources: ${f.failing_sources}.${f.paused_reasons.length ? " " + f.paused_reasons.join(" ") : ""}`).join("\n") || "No feeds found.";
    return { content: [{ type: "text", text }], structuredContent: { feeds } };
  },
});
