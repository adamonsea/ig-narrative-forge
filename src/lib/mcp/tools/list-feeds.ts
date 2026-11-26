import { defineTool } from "@lovable.dev/mcp-js";
import { ToolError } from "@lovable.dev/mcp-js";
import { startCall } from "../gate";

interface FeedRow { id: string; name: string; slug: string; owner_pro: boolean; autopilot: boolean; sources_count: number; stories_this_week: number }

export default defineTool({
  name: "list_feeds",
  title: "List my feeds",
  description: "List the Curatr feeds you manage, with plan, Autopilot status, source count and stories published this week.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const db = await startCall(ctx, "list_feeds");
    const { data, error } = await db.rpc("mcp_studio_feeds" as never);
    if (error) throw new ToolError("Couldn't load your feeds. Try again.");
    const feeds = ((data ?? []) as FeedRow[]).map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      public_url: `https://curatr.pro/@${f.slug}`,
      plan: f.owner_pro ? "Pro" : "Free",
      autopilot: f.autopilot,
      sources_count: Number(f.sources_count),
      stories_this_week: Number(f.stories_this_week),
    }));
    const text = feeds.length
      ? feeds.map((f) => `${f.name} (${f.plan}${f.autopilot ? ", Autopilot on" : ""}): ${f.sources_count} sources, ${f.stories_this_week} stories this week. ${f.public_url}`).join("\n")
      : "You don't manage any feeds yet.";
    return { content: [{ type: "text", text }], structuredContent: { feeds } };
  },
});
