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
  /** Owner turned off "make picture" for this story. */
  skip_auto_illustration?: boolean | null;
}

export interface AutoPictureSettings {
  automation_mode?: string | null;
  auto_illustrate_in_holiday?: boolean | null;
}

/** The story is live in the feed's terms: published status and published flag. */
export function isLiveStory(s: IllustrationGateStory): boolean {
  return s.status === "published" && s.is_published === true;
}

/** A just-published story that still needs its automatic picture (and the owner didn't say no). */
export function needsPublishIllustration(s: IllustrationGateStory): boolean {
  return isLiveStory(s) && !s.cover_illustration_url && s.skip_auto_illustration !== true;
}

/** Autopilot with pictures switched off means no automatic pictures for that feed. */
export function feedAllowsAutoPictures(settings: AutoPictureSettings | null | undefined): boolean {
  return !(settings?.automation_mode === "holiday" && settings?.auto_illustrate_in_holiday === false);
}

/** Cheapest tier, the same one autopilot uses. */
export const PUBLISH_ILLUSTRATION_MODEL = "gpt-image-2-low";
