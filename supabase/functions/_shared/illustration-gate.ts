/**
 * Paid pictures wait for publication.
 *
 * An AI picture costs money (and the owner's credits), so a story only gets one
 * automatically once it's live: status 'published' and flagged published. Drafts and
 * ready (drip) stories get theirs at the moment they're published, if they still have none.
 * Shared by the story writer, the drip publisher and the Desk's Publish actions.
 */
export interface IllustrationGateStory {
  status?: string | null;
  is_published?: boolean | null;
  cover_illustration_url?: string | null;
}

/** The story is live in the feed's terms: published status and published flag. */
export function isLiveStory(s: IllustrationGateStory): boolean {
  return s.status === "published" && s.is_published === true;
}

/** A just-published story that still needs its automatic picture. */
export function needsPublishIllustration(s: IllustrationGateStory): boolean {
  return isLiveStory(s) && !s.cover_illustration_url;
}

/** Cheapest tier, the same one autopilot uses. */
export const PUBLISH_ILLUSTRATION_MODEL = "gpt-image-2-low";
