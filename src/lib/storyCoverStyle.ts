/**
 * Story cover styles.
 *
 * 'split'      — picture above the headline (the long-standing cover).
 * 'full-bleed' — picture fills the whole first slide, headline sits on it in white.
 *
 * Slides 2+ are identical in both styles.
 */
export type StoryCoverStyle = 'split' | 'full-bleed';

export const STORY_COVER_STYLES: StoryCoverStyle[] = ['split', 'full-bleed'];

export const STORY_COVER_LABELS: Record<StoryCoverStyle, string> = {
  split: 'Split',
  'full-bleed': 'Full bleed',
};

/**
 * One rule for every reader of the setting: anything unknown (null, a value from
 * an older feed, a typo) means 'split', so no feed ever renders a cover nobody chose.
 */
export function resolveStoryCoverStyle(raw: unknown): StoryCoverStyle {
  return raw === 'full-bleed' ? 'full-bleed' : 'split';
}
