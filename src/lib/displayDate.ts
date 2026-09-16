/**
 * Display date for feed and pipeline ordering.
 *
 * Stories whose original publication date is within the last 3 days keep their
 * "new to me" position (ordered by when we created the story). Anything older
 * slots back into the timeline at its original publication date, so legacy
 * stories curated today cannot dominate the top of a feed.
 */
const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export const getDisplayDate = (
  createdAt?: string | null,
  originalPublishedAt?: string | null
): string => {
  const created = createdAt || new Date().toISOString();
  if (!originalPublishedAt) return created;

  const publishedTime = new Date(originalPublishedAt).getTime();
  if (isNaN(publishedTime)) return created;

  if (publishedTime > Date.now() - RECENT_WINDOW_MS) return created;

  return new Date(publishedTime).toISOString();
};
