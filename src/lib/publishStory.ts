/**
 * The one update that puts a written story live from the Desk. "Without picture" also
 * records the owner's no-picture choice on the story, so no automated path draws one later
 * (story-illustrator enforces `skip_auto_illustration`). Publishing normally leaves any
 * earlier no-picture choice as it was.
 */
export function publishNowUpdate(nowIso: string, opts: { withPicture?: boolean } = {}) {
  return {
    scheduled_publish_at: null,
    status: "published" as const,
    is_published: true,
    published_at: nowIso,
    updated_at: nowIso,
    ...(opts.withPicture === false ? { skip_auto_illustration: true } : {}),
  };
}
