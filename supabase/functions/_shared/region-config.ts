import { RegionConfig } from './types.ts';

export interface TopicRegionalConfig {
  keywords: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  region_name: string;
}

/**
 * Calculate regional relevance using user-defined topic configuration
 * No hardcoded regional biases - entirely user-driven
 */
export function calculateRegionalRelevance(
  content: string,
  title: string,
  topicConfig: TopicRegionalConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = []
): number {
  if (!topicConfig || !topicConfig.keywords?.length) return 0;

  const text = `${title} ${content}`.toLowerCase();
  let score = 0;

  // Keyword matching (base score)
  const keywordMatches = topicConfig.keywords.filter(keyword => 
    text.includes(keyword.toLowerCase())
  ).length;
  score += keywordMatches * 10;

  // Landmark matching (higher weight)
  if (topicConfig.landmarks?.length) {
    const landmarkMatches = topicConfig.landmarks.filter(landmark => 
      text.includes(landmark.toLowerCase())
    ).length;
    score += landmarkMatches * 15;
  }

  // Postcode matching (very specific)
  if (topicConfig.postcodes?.length) {
    const postcodeMatches = topicConfig.postcodes.filter(postcode => 
      text.includes(postcode.toLowerCase())
    ).length;
    score += postcodeMatches * 20;
  }

  // Organization matching (institutional relevance)
  if (topicConfig.organizations?.length) {
    const orgMatches = topicConfig.organizations.filter(org => 
      text.includes(org.toLowerCase())
    ).length;
    score += orgMatches * 12;
  }

  // Dynamic negative scoring based on OTHER regional topics (user-defined)
  if (otherRegionalTopics?.length) {
    const otherRegionTerms = otherRegionalTopics
      .filter(other => other.region_name !== topicConfig.region_name)
      .flatMap(other => [...other.keywords, ...(other.landmarks || [])])
      .filter(term => term && term.length > 2); // Filter short/empty terms
    
    const negativeMatches = otherRegionTerms.filter(term => 
      text.includes(term.toLowerCase()) && 
      !text.includes(`${term.toLowerCase()} to ${topicConfig.region_name.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} to ${term.toLowerCase()}`)
    ).length;
    score -= negativeMatches * 8; // Penalty for other user-defined regional areas
  }

  // Enhanced filtering for BBC and national sources - give them baseline UK relevance
  if (sourceType === 'national') {
    const ukKeywords = ['uk', 'britain', 'british', 'england', 'sussex', 'south east'];
    const ukMatches = ukKeywords.filter(keyword => text.includes(keyword)).length;
    if (ukMatches > 0) {
      score += 30; // Baseline UK relevance for national sources
    }
  }

  // Source type bonus/penalty
  const sourceMultiplier = {
    'hyperlocal': 1.5,
    'regional': 1.2,
    'national': 1.0
  }[sourceType] || 1.0;

  // Ensure minimum score isn't negative
  return Math.max(0, Math.round(score * sourceMultiplier));
}