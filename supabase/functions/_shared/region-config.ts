import {
  applyNewsValues,
  detectPlaceTier,
  NearbyPlace,
  NewsValueDecision,
  NewsValuesConfig,
} from './news-values.ts';

export interface TopicRegionalConfig {
  keywords: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  competing_regions?: string[];
  region_name: string;
  nearby_places?: NearbyPlace[];
  locality_strength?: number | null;
  big_story_override?: boolean | null;
}

/**
 * Regional relevance, place-first.
 *
 * Order of business:
 *   1. Decide the place tier (home / nearby / further out / nowhere).
 *   2. Score the topical signals — but only once a place has been established,
 *      so everyday keywords like "police" or "community" can never carry an
 *      article on their own.
 *   3. Apply the owner's dial: distance discount, nowhere cap, big-story rescue.
 */
export function calculateRegionalRelevanceDetailed(
  content: string,
  title: string,
  topicConfig: TopicRegionalConfig,
  sourceType: string = 'national',
  _otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): NewsValueDecision {
  const newsValues: NewsValuesConfig = {
    region: topicConfig.region_name,
    landmarks: topicConfig.landmarks,
    postcodes: topicConfig.postcodes,
    organizations: topicConfig.organizations,
    nearby_places: topicConfig.nearby_places,
    locality_strength: topicConfig.locality_strength,
    big_story_override: topicConfig.big_story_override,
  };

  const place = detectPlaceTier(title, content, newsValues);
  const text = `${title} ${content}`.toLowerCase();

  let raw = 0;

  if (place.tier === 'home') {
    const regionName = topicConfig.region_name.toLowerCase();
    const regionMatches = (
      text.match(new RegExp(`\\b${regionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []
    ).length;
    raw += Math.min(regionMatches, 3) * 20;
    if (regionMatches === 0) raw += 20; // matched on a landmark / postcode / organisation
  } else if (place.tier === 'nearby' || place.tier === 'far') {
    raw += 20;
  }

  // Topical signals only count once a place is established.
  if (place.tier !== 'nowhere') {
    const keywordMatches = (topicConfig.keywords || []).filter((keyword) =>
      keyword && text.includes(keyword.toLowerCase())
    ).length;
    raw += Math.min(keywordMatches, 5) * 8;

    if (topicConfig.landmarks?.length) {
      const landmarkMatches = topicConfig.landmarks.filter((l) => l && text.includes(l.toLowerCase())).length;
      raw += Math.min(landmarkMatches, 3) * 15;
    }
    if (topicConfig.postcodes?.length) {
      const postcodeMatches = topicConfig.postcodes.filter((p) => p && text.includes(p.toLowerCase())).length;
      raw += Math.min(postcodeMatches, 2) * 20;
    }
    if (topicConfig.organizations?.length) {
      const orgMatches = topicConfig.organizations.filter((o) => o && text.includes(o.toLowerCase())).length;
      raw += Math.min(orgMatches, 3) * 12;
    }

    // Source trust nudges a placed story up; it can never manufacture a place.
    const sourceBonus = { hyperlocal: 15, regional: 10, national: 0 }[sourceType] ?? 0;
    raw += sourceBonus;
  } else {
    // Nowhere: a small topical read only, so the nowhere cap has something to bite on.
    const keywordMatches = (topicConfig.keywords || []).filter((keyword) =>
      keyword && text.includes(keyword.toLowerCase())
    ).length;
    raw += Math.min(keywordMatches, 3) * 5;
  }

  // A URL that belongs to another town is a real signal that this is not local.
  if (sourceUrl && place.tier !== 'home') {
    const nearbyNames = (topicConfig.nearby_places || []).map((p) => p.name?.toLowerCase()).filter(Boolean);
    if (nearbyNames.some((n) => n && sourceUrl.toLowerCase().includes(n))) {
      raw -= 10;
    }
  }

  return applyNewsValues(raw, title, content, newsValues, place);
}

/** Back-compatible numeric entry point. */
export function calculateRegionalRelevance(
  content: string,
  title: string,
  topicConfig: TopicRegionalConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): number {
  if (!topicConfig || !topicConfig.region_name) return 0;
  const decision = calculateRegionalRelevanceDetailed(
    content,
    title,
    topicConfig,
    sourceType,
    otherRegionalTopics,
    sourceUrl
  );
  console.log(
    `📊 "${(title || '').substring(0, 40)}" → ${decision.score} (${decision.reason})`
  );
  return decision.score;
}
