import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { startCall } from "../gate";

interface Status { is_pro: boolean; exempt: boolean; balance: number; month_stories: number; story_limit: number; trial_over: boolean; trial_ends_at: string | null; trial_stories: number }

export default defineTool({
  name: "get_account",
  title: "My account",
  description: "Show your Curatr plan, credits left, stories used this month against your allowance, and free trial status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const db = await startCall(ctx, "get_account");
    const { data, error } = await db.rpc("mcp_studio_account" as never);
    if (error || !data) throw new ToolError("Couldn't load your account. Try again.");
    const s = data as Status;
    const account = {
      plan: s.is_pro ? "Pro" : "Free",
      credits_left: s.balance,
      stories_used_this_month: s.is_pro ? s.month_stories : s.trial_stories,
      story_allowance: s.story_limit,
      trial: s.is_pro || s.exempt
        ? { active: false, ends_at: null, stories_left: null }
        : { active: !s.trial_over, ends_at: s.trial_ends_at, stories_left: Math.max(0, s.story_limit - s.trial_stories) },
    };
    const text = `Plan: ${account.plan}. Credits left: ${account.credits_left}. Stories: ${account.stories_used_this_month} of ${account.story_allowance}.` +
      (account.trial.active ? ` Free trial ends ${account.trial.ends_at?.slice(0, 10)} or after ${account.trial.stories_left} more stories.` : "");
    return { content: [{ type: "text", text }], structuredContent: { account } };
  },
});
