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

/**
 * Words for approving a gathered article that isn't written yet. On a feed that releases
 * stories on a schedule, approving writes the story and slots it into the next free release
 * time, behind stories already queued, so it reads "Add to queue". Otherwise it goes live
 * as soon as it's written.
 */
export function approveArticleLabels(releasesOnSchedule: boolean) {
  return releasesOnSchedule
    ? { main: "Add to queue", withoutPicture: "Add to queue without picture" }
    : { main: "Publish", withoutPicture: "Publish without picture" };
}
