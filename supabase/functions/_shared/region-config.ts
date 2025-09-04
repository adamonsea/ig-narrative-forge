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

  // Region name matching (highest priority - significant boost when topic's own region is mentioned)
  const regionName = topicConfig.region_name.toLowerCase();
  const regionNameMatches = (text.match(new RegExp(`\\b${regionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
  score += regionNameMatches * 30; // Major boost for region name mentions

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

  // Enhanced negative scoring based on OTHER regional topics (user-defined)
  if (otherRegionalTopics?.length) {
    const otherRegionTerms = otherRegionalTopics
      .filter(other => other.region_name !== topicConfig.region_name)
      .flatMap(other => [...other.keywords, ...(other.landmarks || []), ...(other.postcodes || [])])
      .filter(term => term && term.length > 2); // Filter short/empty terms
    
    // Strong penalty for direct competing region mentions
    const competingRegionNames = otherRegionalTopics
      .filter(other => other.region_name !== topicConfig.region_name)
      .map(other => other.region_name.toLowerCase());
    
    const directRegionMatches = competingRegionNames.filter(regionName =>
      text.includes(regionName) && 
      !text.includes(`${regionName} to ${topicConfig.region_name.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} to ${regionName}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} and ${regionName}`) &&
      !text.includes(`${regionName} and ${topicConfig.region_name.toLowerCase()}`)
    ).length;
    
    // Penalty for other specific regional terms
    const negativeMatches = otherRegionTerms.filter(term => 
      text.includes(term.toLowerCase()) && 
      !text.includes(`${term.toLowerCase()} to ${topicConfig.region_name.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} to ${term.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} and ${term.toLowerCase()}`) &&
      !text.includes(`${term.toLowerCase()} and ${topicConfig.region_name.toLowerCase()}`)
    ).length;
    
    // Apply strong penalties
    score -= directRegionMatches * 50; // Heavy penalty for direct competing region mentions
    score -= negativeMatches * 20; // Increased penalty for competing regional terms
  }

  // Enhanced filtering for national sources - reduce generic geographic boost
  if (sourceType === 'national') {
    // Only give modest boost for very generic UK terms, prioritize specific regional terms
    const specificUkKeywords = ['uk', 'britain', 'british', 'england'];
    const genericGeographicTerms = ['sussex', 'south east', 'southeast'];
    
    const specificUkMatches = specificUkKeywords.filter(keyword => text.includes(keyword)).length;
    const genericGeoMatches = genericGeographicTerms.filter(keyword => text.includes(keyword)).length;
    
    if (specificUkMatches > 0) {
      score += 15; // Reduced baseline UK relevance for national sources
    }
    
    // Minimal boost for generic geographic terms, only if no competing regions detected
    const hasCompetingRegions = otherRegionalTopics?.some(other => 
      other.region_name !== topicConfig.region_name && 
      text.includes(other.region_name.toLowerCase())
    );
    
    if (genericGeoMatches > 0 && !hasCompetingRegions) {
      score += 5; // Very small boost for generic geographic terms
    }
  }

  // Source type bonus/penalty
  const sourceMultiplier = {
    'hyperlocal': 1.5,
    'regional': 1.2,
    'national': 1.0
  }[sourceType] || 1.0;

  // Apply source multiplier first, then ensure reasonable bounds
  const finalScore = Math.round(score * sourceMultiplier);
  
  // Allow negative scores to indicate content that should be excluded
  // But cap extreme negative scores to prevent overflow issues
  return Math.max(-100, finalScore);
}