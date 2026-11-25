// Renamed feeds: an old handle (topic_slug_history) resolves to the feed's current slug.
// Every edge function that finds a feed by slug runs it through here first, so old links and embeds keep working.
// deno-lint-ignore no-explicit-any
export async function currentFeedSlug(supabase: any, slug: string | null | undefined): Promise<string> {
  const s = (slug ?? "").trim();
  if (!s) return s;
  try {
    const { data } = await supabase.rpc("resolve_feed_slug", { p_slug: s });
    return typeof data === "string" && data ? data : s;
  } catch {
    return s;
  }
}
