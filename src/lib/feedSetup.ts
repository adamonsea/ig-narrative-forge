// Shared rules for creating a feed from one sentence (or by hand).
// Pure functions only, so the setup decisions are testable.
import { FEATURES } from './featureFlags';

export type PictureChoice = 'editorial_illustrative' | 'editorial_photographic' | 'illustrated_icon' | 'source';

export interface FeedSetupDraft {
  name: string;
  topic_type: 'regional' | 'keyword';
  region: string | null;
  description: string;
  keywords: string[];
  negative_keywords: string[];
  colour: string;
  pictures: PictureChoice;
  welcome: string;
  brand_or_fandom: boolean;
  family_safe: boolean;
  autopilot: boolean;
}

export const PICTURE_LABELS: Record<PictureChoice, string> = {
  editorial_illustrative: 'Illustrated',
  editorial_photographic: 'Photographic',
  illustrated_icon: 'Simple graphics',
  source: 'Source photos',
};

export const BRAND_COLOURS = ['#2563EB', '#0F766E', '#B91C1C', '#C2410C', '#7C3AED', '#BE185D', '#15803D', '#1E3A5F'];

/** URL-safe feed address. Accents are folded, so "Pokémon" becomes "pokemon". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Next name to try when a feed address is taken: "Name", "Name 2", "Name 3"… */
export function nameCandidate(base: string, attempt: number): string {
  const clean = base.trim().replace(/\s+/g, ' ').slice(0, 56);
  return attempt <= 1 ? clean : `${clean} ${attempt}`;
}

/** Adds a term to a list once (case-insensitive), lower-cased and trimmed. */
export function addTerm(list: string[], term: string): string[] {
  const t = term.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);
  if (!t || list.some((x) => x.toLowerCase() === t)) return list;
  return [...list, t];
}

/** Turns the server's suggestion into an editable draft. New feeds get Autopilot on. */
export function draftFromSuggestion(s: {
  name: string; topic_type: 'regional' | 'keyword'; region: string | null; description: string;
  keywords: string[]; negative_keywords: string[]; colour: string; illustration_style: string;
  welcome: string; brand_or_fandom: boolean; family_safe: boolean;
}, nameOverride?: string): FeedSetupDraft {
  return {
    name: (nameOverride ?? s.name).slice(0, 60),
    topic_type: s.topic_type,
    region: s.region,
    description: s.description,
    keywords: s.keywords,
    negative_keywords: s.negative_keywords,
    colour: s.colour,
    // Brand/fandom feeds keep the source's own photos; characters and logos are never drawn.
    pictures: s.brand_or_fandom ? 'source' : (s.illustration_style as PictureChoice),
    welcome: s.welcome,
    brand_or_fandom: s.brand_or_fandom,
    family_safe: FEATURES.familySafe && s.family_safe,
    autopilot: true,
  };
}

/** The columns a new feed is created with. Never touches existing feeds. */
export function topicInsertFromDraft(d: FeedSetupDraft, slug: string, userId: string) {
  return {
    name: d.name.trim().slice(0, 60),
    slug,
    topic_type: d.region ? d.topic_type : 'keyword',
    region: d.topic_type === 'regional' ? d.region : null,
    description: d.description || null,
    keywords: d.keywords.length > 0 ? d.keywords : [d.name.trim().toLowerCase()],
    negative_keywords: d.negative_keywords,
    audience_expertise: 'beginner' as const,
    illustration_primary_color: d.colour,
    illustration_style: d.pictures === 'source' ? 'illustrated_icon' : d.pictures,
    branding_config: { subheader: d.welcome.trim().slice(0, 110) },
    // Family-safe is parked (docs/parked-features.md): new feeds keep the column default while it's off.
    ...(FEATURES.familySafe ? { family_safe: d.family_safe } : {}),
    brand_safe_pictures: d.brand_or_fandom,
    // Autopilot: written stories publish straight away (the story writer reads this flag).
    auto_simplify_enabled: d.autopilot,
    is_active: true,
    is_public: true,
    created_by: userId,
  };
}

/** Automation row for a new feed: Autopilot = gather, write and publish on its own. */
export function automationFromDraft(d: FeedSetupDraft, now = new Date()) {
  const drawPictures = d.pictures !== 'source' && !d.brand_or_fandom;
  return d.autopilot
    ? {
        automation_mode: 'holiday',
        is_active: true,
        auto_simplify_enabled: true,
        auto_illustrate_enabled: drawPictures,
        auto_illustrate_in_holiday: drawPictures,
        next_run_at: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      }
    : {
        automation_mode: 'auto_gather',
        is_active: true,
        auto_simplify_enabled: false,
        auto_illustrate_enabled: false,
        auto_illustrate_in_holiday: drawPictures,
        next_run_at: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      };
}
