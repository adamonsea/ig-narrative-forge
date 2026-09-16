/**
 * Browser-side mirror of supabase/functions/_shared/news-values.ts.
 * Kept deliberately small and identical in behaviour so the preview counts a
 * feed owner sees match what the pipeline actually does.
 */

export type PlaceTier = 'home' | 'nearby' | 'far' | 'nowhere';

export interface NearbyPlace {
  name: string;
  tier: 'near' | 'far';
}

export interface NewsValuesConfig {
  region?: string | null;
  landmarks?: string[] | null;
  postcodes?: string[] | null;
  organizations?: string[] | null;
  nearby_places?: NearbyPlace[] | null;
  locality_strength?: number | null;
  big_story_override?: boolean | null;
}

export interface DialSettings {
  label: string;
  blurb: string;
  nearMultiplier: number;
  farMultiplier: number;
  nowhereCap: number;
  autoPublishThreshold: number;
  allowNowhereOverride: boolean;
}

export const LOCALITY_DIAL: Record<number, DialSettings> = {
  1: {
    label: 'Strictly my town',
    blurb: 'Only stories that name your town, a landmark, a postcode or one of your organisations.',
    nearMultiplier: 0.5,
    farMultiplier: 0.2,
    nowhereCap: 10,
    autoPublishThreshold: 70,
    allowNowhereOverride: false,
  },
  2: {
    label: 'Mostly my town',
    blurb: 'Your town comes first; a neighbouring place needs to be a strong story to appear.',
    nearMultiplier: 0.65,
    farMultiplier: 0.35,
    nowhereCap: 12,
    autoPublishThreshold: 65,
    allowNowhereOverride: false,
  },
  3: {
    label: 'Balanced',
    blurb: 'Your town plus worthwhile news from the places next door.',
    nearMultiplier: 0.8,
    farMultiplier: 0.55,
    nowhereCap: 15,
    autoPublishThreshold: 60,
    allowNowhereOverride: false,
  },
  4: {
    label: 'Town and district',
    blurb: 'Neighbouring places are treated almost like home.',
    nearMultiplier: 0.9,
    farMultiplier: 0.7,
    nowhereCap: 20,
    autoPublishThreshold: 55,
    allowNowhereOverride: true,
  },
  5: {
    label: 'Wide area',
    blurb: 'Anything across your area, including big stories that never name a place.',
    nearMultiplier: 1,
    farMultiplier: 0.85,
    nowhereCap: 30,
    autoPublishThreshold: 50,
    allowNowhereOverride: true,
  },
};

export function getDial(strength?: number | null): DialSettings {
  const step = Math.min(5, Math.max(1, Math.round(strength ?? 3)));
  return LOCALITY_DIAL[step];
}

export function parseNearbyPlaces(value: unknown): NearbyPlace[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry, tier: 'far' as const };
      const name = (entry as { name?: unknown })?.name;
      if (typeof name !== 'string' || !name.trim()) return null;
      const tier = (entry as { tier?: unknown })?.tier === 'near' ? 'near' : 'far';
      return { name: name.trim(), tier } as NearbyPlace;
    })
    .filter((p): p is NearbyPlace => !!p);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(haystack: string, name: string): boolean {
  const clean = name.trim();
  if (clean.length < 2) return false;
  return new RegExp(`\\b${escapeRegex(clean.toLowerCase())}\\b`, 'i').test(haystack);
}

export interface PlaceDecision {
  tier: PlaceTier;
  matched: string | null;
  reason: string;
}

export function detectPlaceTier(
  title: string,
  body: string,
  config: NewsValuesConfig
): PlaceDecision {
  const opening = (body || '').slice(0, 1200);
  const haystack = `${title || ''} ${opening}`.toLowerCase();
  const wholeText = `${title || ''} ${body || ''}`.toLowerCase();

  const region = (config.region || '').trim();
  if (region && (mentions(haystack, region) || mentions(wholeText, region))) {
    return { tier: 'home', matched: region, reason: `Home — names ${region}` };
  }

  const homeNames = [
    ...(config.landmarks || []),
    ...(config.postcodes || []),
    ...(config.organizations || []),
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 1);

  for (const name of homeNames) {
    if (mentions(haystack, name)) {
      return { tier: 'home', matched: name, reason: `Home — ${name}` };
    }
  }

  const nearby = parseNearbyPlaces(config.nearby_places);
  const nearMatch = nearby.find((p) => p.tier === 'near' && mentions(haystack, p.name));
  if (nearMatch) {
    return { tier: 'nearby', matched: nearMatch.name, reason: `Nearby (${nearMatch.name})` };
  }
  const farMatch = nearby.find((p) => p.tier === 'far' && mentions(haystack, p.name));
  if (farMatch) {
    return { tier: 'far', matched: farMatch.name, reason: `Further out (${farMatch.name})` };
  }

  return { tier: 'nowhere', matched: null, reason: 'No place named' };
}

const INCIDENT_WORDS = [
  'died', 'death', 'deaths', 'killed', 'fatal', 'murder', 'manslaughter',
  'fire', 'blaze', 'crash', 'collision', 'derailment', 'explosion',
  'arrested', 'charged', 'sentenced', 'jailed', 'court', 'inquest', 'trial',
  'evacuated', 'rescue', 'missing', 'flood', 'flooding', 'storm damage',
  'closure', 'closing', 'shut down', 'collapse', 'strike', 'walkout',
  'redundancies', 'job losses', 'outbreak', 'emergency', 'major incident',
];

export function scoreStoryStrength(
  title: string,
  body: string,
  organizations: string[] = []
): { score: number; signals: string[] } {
  const titleLower = (title || '').toLowerCase();
  const text = `${titleLower} ${(body || '').slice(0, 2000).toLowerCase()}`;
  const signals: string[] = [];
  let score = 0;

  for (const word of INCIDENT_WORDS) {
    if (text.includes(word)) {
      score += titleLower.includes(word) ? 25 : 12;
      signals.push(word);
      if (signals.length >= 4) break;
    }
  }

  if (/£\s?\d+(\.\d+)?\s?(m|bn|million|billion)\b/i.test(text)) {
    score += 20;
    signals.push('large sum');
  } else if (/£\s?\d{3},\d{3}/.test(text)) {
    score += 12;
    signals.push('large sum');
  }

  if (/\b\d{3,}\s+(people|residents|homes|households|jobs|patients|pupils|staff)\b/i.test(text)) {
    score += 18;
    signals.push('many people affected');
  }

  const namedOrg = (organizations || []).find((org) => org && mentions(text, org));
  if (namedOrg) {
    score += 20;
    signals.push(namedOrg);
  }

  return { score: Math.min(100, score), signals };
}

export const BIG_STORY_THRESHOLD = 40;

export interface NewsValueDecision {
  score: number;
  tier: PlaceTier;
  matched: string | null;
  autoPublish: boolean;
  overrode: boolean;
  reason: string;
}

export function applyNewsValues(
  rawScore: number,
  title: string,
  body: string,
  config: NewsValuesConfig,
  place?: PlaceDecision
): NewsValueDecision {
  const dial = getDial(config.locality_strength);
  const decision = place ?? detectPlaceTier(title, body, config);
  const overrideEnabled = config.big_story_override !== false;

  const strength = overrideEnabled && decision.tier !== 'home'
    ? scoreStoryStrength(title, body, config.organizations || [])
    : { score: 0, signals: [] as string[] };
  const isBigStory = overrideEnabled && strength.score >= BIG_STORY_THRESHOLD;

  let score = Math.max(0, Math.min(100, Math.round(rawScore)));
  let reason = decision.reason;
  let autoPublish = false;

  if (decision.tier === 'home') {
    autoPublish = score >= dial.autoPublishThreshold;
  } else if (decision.tier === 'nearby' || decision.tier === 'far') {
    const multiplier = decision.tier === 'nearby' ? dial.nearMultiplier : dial.farMultiplier;
    const discounted = Math.round(score * multiplier);
    score = isBigStory ? score : discounted;
    if (isBigStory) reason = `${decision.reason} — big story (${strength.signals.slice(0, 2).join(', ')})`;
    autoPublish = score >= dial.autoPublishThreshold && (decision.tier === 'nearby' || isBigStory);
  } else {
    score = Math.min(score, dial.nowhereCap);
    if (isBigStory && dial.allowNowhereOverride) {
      score = Math.max(score, dial.autoPublishThreshold);
      reason = `No place named — big story (${strength.signals.slice(0, 2).join(', ')})`;
      autoPublish = true;
    } else {
      reason = 'No place named — held for review';
      autoPublish = false;
    }
  }

  return {
    score,
    tier: decision.tier,
    matched: decision.matched,
    autoPublish,
    overrode: isBigStory && decision.tier !== 'home',
    reason,
  };
}
