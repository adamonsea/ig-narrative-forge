// Per-category feed controls applied at the ingest gate.
//
// Stories are only formally categorised after generation (classify-stories),
// but the owner's per-category settings need to bite BEFORE an article is
// queued. This module makes a cheap, deterministic keyword guess at the
// category of an incoming article and applies the topic's per-category
// overrides (enabled, relevance threshold, geographic radius).
//
// It is deliberately conservative: when no category can be guessed with
// reasonable confidence, the gate fails open and topic-wide defaults apply.

import { loadTaxonomy, CategoryRow } from './taxonomy.ts';

export interface CategorySetting {
  category_id: string;
  enabled: boolean;
  geographic_radius_miles: number | null;
  relevance_threshold: number | null;
  automation_mode: string;
}

export interface CategoryGate {
  categories: CategoryRow[];
  settingsByCategoryId: Record<string, CategorySetting>;
  active: boolean;
}

/** Keyword hints per well-known parent slug. Matched case-insensitively. */
const SLUG_KEYWORDS: Record<string, string[]> = {
  crime: ['police', 'arrest', 'assault', 'burglary', 'robbery', 'stabbing', 'theft', 'shoplifting', 'jailed', 'sentenced', 'court', 'charged', 'fraud', 'drugs', 'crown court', 'magistrates'],
  'missing-persons': ['missing', 'appeal to find', 'last seen', 'have you seen', 'concern for welfare', 'urgent appeal'],
  'council-politics': ['council', 'councillor', 'cabinet', 'mp ', 'borough', 'county council', 'election', 'budget', 'town hall'],
  politics: ['council', 'councillor', 'mp ', 'election', 'parliament', 'government'],
  'planning-development': ['planning application', 'planning permission', 'development', 'housing scheme', 'demolition', 'approved plans', 'regeneration'],
  planning: ['planning application', 'planning permission', 'development', 'demolition', 'regeneration'],
  transport: ['road', 'traffic', 'bus', 'train', 'rail', 'roadworks', 'a27', 'closure', 'cycle lane', 'parking'],
  health: ['nhs', 'hospital', 'gp ', 'ambulance', 'patients', 'health', 'surgery', 'mental health'],
  education: ['school', 'pupils', 'ofsted', 'college', 'university', 'teachers', 'headteacher'],
  business: ['business', 'shop', 'store', 'opening', 'closes', 'jobs', 'firm', 'company', 'restaurant', 'pub'],
  environment: ['beach', 'coast', 'sewage', 'wildlife', 'climate', 'recycling', 'green', 'park', 'tree', 'flood'],
  'environment-coast': ['beach', 'coast', 'sewage', 'wildlife', 'climate', 'recycling', 'seafront', 'tree', 'flood'],
  'culture-events': ['festival', 'concert', 'gig', 'exhibition', 'theatre', 'museum', 'show', 'art', 'carnival'],
  culture: ['festival', 'concert', 'exhibition', 'theatre', 'museum', 'art'],
  sport: ['football', 'fc ', 'cricket', 'rugby', 'match', 'league', 'athletics', 'tennis', 'marathon'],
  community: ['charity', 'volunteers', 'fundraiser', 'community', 'residents', 'appeal raises', 'donations'],
  weather: ['weather', 'storm', 'flooding', 'snow', 'heatwave', 'wind warning', 'met office'],
  'weather-incidents': ['weather', 'storm', 'flooding', 'fire', 'crash', 'collision', 'rescue', 'incident'],
  incidents: ['fire', 'crash', 'collision', 'rescue', 'emergency services', 'coastguard'],
};

function keywordsFor(cat: CategoryRow): string[] {
  const base = SLUG_KEYWORDS[cat.slug] ?? [];
  const fromName = cat.name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 4);
  return Array.from(new Set([...base, ...fromName]));
}

/** Load the taxonomy plus this topic's per-category overrides. */
export async function loadCategoryGate(service: any, topicId: string): Promise<CategoryGate> {
  try {
    const [categories, { data: settings }] = await Promise.all([
      loadTaxonomy(service, topicId),
      service
        .from('topic_category_settings')
        .select('category_id, enabled, geographic_radius_miles, relevance_threshold, automation_mode')
        .eq('topic_id', topicId),
    ]);

    const settingsByCategoryId: Record<string, CategorySetting> = {};
    for (const s of (settings ?? []) as CategorySetting[]) settingsByCategoryId[s.category_id] = s;

    return {
      categories,
      settingsByCategoryId,
      // Only worth running when the owner has actually customised something.
      active: Object.keys(settingsByCategoryId).length > 0 && categories.length > 0,
    };
  } catch (err) {
    console.warn('⚠️ Category gate unavailable, failing open:', err instanceof Error ? err.message : err);
    return { categories: [], settingsByCategoryId: {}, active: false };
  }
}

/** Cheap keyword guess of the parent category for an article. */
export function guessCategory(title: string, body: string, categories: CategoryRow[]): CategoryRow | null {
  const haystack = `${title} ${body.slice(0, 1200)}`.toLowerCase();
  const parents = categories.filter((c) => !c.parent_id);

  let best: { cat: CategoryRow; score: number } | null = null;
  for (const cat of parents) {
    let score = 0;
    for (const kw of keywordsFor(cat)) {
      if (kw && haystack.includes(kw)) score++;
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score };
  }
  // Require at least two hits so a single incidental word can't gate a story.
  return best && best.score >= 2 ? best.cat : null;
}

export interface CategoryDecision {
  category: CategoryRow | null;
  /** Hold the article for manual review instead of auto-queueing. */
  hold: boolean;
  reason?: string;
  /** Skip the topic-wide locality anchor requirement (wide-radius category). */
  relaxLocality: boolean;
}

/**
 * Apply the topic's per-category overrides to one article.
 * Fails open: unknown category => no change to existing behaviour.
 */
export function applyCategoryGate(
  gate: CategoryGate,
  title: string,
  body: string,
  qualityScore: number | null
): CategoryDecision {
  if (!gate.active) return { category: null, hold: false, relaxLocality: false };

  const category = guessCategory(title, body ?? '', gate.categories);
  if (!category) return { category: null, hold: false, relaxLocality: false };

  const setting = gate.settingsByCategoryId[category.id];
  if (!setting) return { category, hold: false, relaxLocality: false };

  if (setting.enabled === false) {
    return { category, hold: true, reason: `category "${category.slug}" is switched off for this feed`, relaxLocality: false };
  }

  if (
    setting.relevance_threshold != null &&
    qualityScore != null &&
    qualityScore < setting.relevance_threshold
  ) {
    return {
      category,
      hold: true,
      reason: `score ${qualityScore} below "${category.slug}" threshold ${setting.relevance_threshold}`,
      relaxLocality: false,
    };
  }

  // A generous radius means the owner wants this category pulled from a wider
  // area (e.g. missing persons), so the strict local-anchor rule is relaxed.
  const relaxLocality = (setting.geographic_radius_miles ?? 0) >= 25;

  return { category, hold: false, relaxLocality };
}
