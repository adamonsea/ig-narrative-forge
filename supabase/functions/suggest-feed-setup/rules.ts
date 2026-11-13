// Pure rules for the one-sentence feed setup. No network, fully testable.

export const PICTURE_STYLES = ['editorial_illustrative', 'editorial_photographic', 'illustrated_icon'] as const;
export type PictureStyle = typeof PICTURE_STYLES[number];

export interface FeedSetup {
  name: string;
  topic_type: 'regional' | 'keyword';
  region: string | null;
  description: string;
  keywords: string[];
  negative_keywords: string[];
  colour: string;
  illustration_style: PictureStyle;
  welcome: string;
  /** Brand, character, game or fandom subject: never draw characters or logos. */
  brand_or_fandom: boolean;
  /** Suggested Family-safe choice: on for hobby, fandom and children's subjects; off for news. */
  family_safe: boolean;
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const list = (value: unknown, max: number, itemMax = 40) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const term = clean(item, itemMax).toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
};

export const titleCase = (value: string) =>
  value.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (_m, space, letter) => space + letter.toUpperCase());

const HEX = /^#[0-9a-f]{6}$/i;

/** Rejects colours too close to white or black to brand a feed. */
export function usableColour(hex: string): boolean {
  if (!HEX.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.08 && luminance < 0.85;
}

/** The fallback used when the model is unavailable: still a working feed. */
export function fallbackSetup(about: string): FeedSetup {
  const subject = titleCase(about).slice(0, 50);
  return {
    name: subject,
    topic_type: 'keyword',
    region: null,
    description: `The latest on ${subject}.`,
    keywords: [about.trim().toLowerCase()].filter(Boolean),
    negative_keywords: [],
    colour: '#2563EB',
    illustration_style: 'editorial_illustrative',
    welcome: `The latest on ${subject}, gathered from trusted sources.`,
    brand_or_fandom: false,
    family_safe: false,
  };
}

/** Turns whatever the model returned into a safe, complete setup. */
export function normaliseSetup(raw: any, about: string): FeedSetup {
  const base = fallbackSetup(about);
  if (!raw || typeof raw !== 'object') return base;
  const topicType = raw.topic_type === 'regional' ? 'regional' : 'keyword';
  const region = topicType === 'regional' ? clean(raw.region, 60) || null : null;
  const keywords = list(raw.keywords, 20);
  const style = PICTURE_STYLES.includes(raw.illustration_style) ? raw.illustration_style as PictureStyle : base.illustration_style;
  const colour = typeof raw.colour === 'string' && usableColour(raw.colour) ? raw.colour.toUpperCase() : base.colour;
  const brand = raw.brand_or_fandom === true;
  return {
    name: clean(raw.name, 60) || base.name,
    topic_type: region ? 'regional' : 'keyword',
    region,
    description: clean(raw.description, 200) || base.description,
    keywords: keywords.length > 0 ? keywords : base.keywords,
    negative_keywords: list(raw.negative_keywords, 10),
    colour,
    illustration_style: brand ? 'illustrated_icon' : style,
    welcome: clean(raw.welcome, 110) || base.welcome,
    brand_or_fandom: brand,
    // Brand/fandom subjects default to Family-safe on; news never does unless the model says so.
    family_safe: raw.family_safe === true || (brand && raw.family_safe !== false),
  };
}
