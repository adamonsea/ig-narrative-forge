import { supabase } from "@/integrations/supabase/client";
import {
  needsPublishIllustration,
  PUBLISH_ILLUSTRATION_MODEL,
} from "../../supabase/functions/_shared/illustration-gate.ts";

export { isLiveStory, needsPublishIllustration } from "../../supabase/functions/_shared/illustration-gate.ts";

/**
 * After the owner publishes a story from the Desk: if it's now live and has no picture,
 * draw one (cheapest tier, the owner's credits). Runs in the background; publishing
 * never waits on it or fails because of it. Safety rules (brand-safe feeds, anonymity)
 * still apply because it's sent as an automated picture.
 */
export async function illustrateOnPublish(storyId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("stories")
      .select("status, is_published, cover_illustration_url")
      .eq("id", storyId)
      .maybeSingle();
    if (!data || !needsPublishIllustration(data)) return;
    await supabase.functions.invoke("story-illustrator", {
      body: { storyId, model: PUBLISH_ILLUSTRATION_MODEL, isAutomated: true },
    });
  } catch (e) {
    console.warn("Picture on publish skipped:", e);
  }
}
