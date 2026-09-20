/**
 * Illustration style constants for topic-level editorial visual configuration
 * Used across UI and backend for consistent style selection
 */

export const ILLUSTRATION_STYLES = {
  EDITORIAL_ILLUSTRATIVE: 'editorial_illustrative',
  EDITORIAL_PHOTOGRAPHIC: 'editorial_photographic',
  CARTOON: 'cartoon',
  BW_EDITORIAL_PHOTO: 'bw_editorial_photo',
  ANIME: 'anime',
  ILLUSTRATED_ICON: 'illustrated_icon',
} as const;

export type IllustrationStyle = typeof ILLUSTRATION_STYLES[keyof typeof ILLUSTRATION_STYLES];

export const ILLUSTRATION_STYLE_LABELS: Record<IllustrationStyle, string> = {
  [ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE]: 'Illustrative (Editorial Cartoons)',
  [ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC]: 'Photographic (Documentary Style)',
  [ILLUSTRATION_STYLES.CARTOON]: 'Cartoon',
  [ILLUSTRATION_STYLES.BW_EDITORIAL_PHOTO]: 'Aged editorial photo',
  [ILLUSTRATION_STYLES.ANIME]: 'Anime',
  [ILLUSTRATION_STYLES.ILLUSTRATED_ICON]: 'Illustrated icon',
};

export const ILLUSTRATION_STYLE_DESCRIPTIONS: Record<IllustrationStyle, string> = {
  [ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE]: 
    'Editorial cartoon style with bold colors and illustrative elements. Best for opinion pieces and local news.',
  [ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC]: 
    'Professional photojournalism style with realistic imagery. Best for serious news and documentary content.',
  [ILLUSTRATION_STYLES.CARTOON]:
    'Expressive editorial cartoon with simple shapes and restrained detail.',
  [ILLUSTRATION_STYLES.BW_EDITORIAL_PHOTO]:
    'Black-and-white newspaper photography with grain and period character.',
  [ILLUSTRATION_STYLES.ANIME]:
    'Editorial anime composition without copying characters or studio styles.',
  [ILLUSTRATION_STYLES.ILLUSTRATED_ICON]:
    'A bold, minimal spot illustration for concise stories and utility content.',
};

/**
 * Validates if a value is a valid illustration style
 */
export function isValidIllustrationStyle(value: unknown): value is IllustrationStyle {
  return typeof value === 'string' && 
    Object.values(ILLUSTRATION_STYLES).includes(value as IllustrationStyle);
}
