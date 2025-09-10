import { RegionConfig } from './types.ts';

export interface TopicRegionalConfig {
  keywords: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  region_name: string;
}

/**
 * PHASE 1: Confidence-Based Regional Relevance Scoring
 * Trust-based approach: If a user adds a source, we trust most content is relevant
 * Focus on confidence levels rather than aggressive rejection
 */
export function calculateRegionalRelevance(
  content: string,
  title: string,
  topicConfig: TopicRegionalConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): number {
  if (!topicConfig || !topicConfig.keywords?.length) return 0;

  const text = `${title} ${content}`.toLowerCase();
  let score = 0;

  // PHASE 1: Trust source selection - much more lenient for URL-based penalties
  if (sourceUrl && otherRegionalTopics?.length) {
    const currentRegion = topicConfig.region_name.toLowerCase();
    
    const competingRegionInUrl = otherRegionalTopics.find(other => 
      other.region_name !== topicConfig.region_name && 
      sourceUrl.toLowerCase().includes(other.region_name.toLowerCase())
    );
    
    if (competingRegionInUrl) {
      // PHASE 1: Reduce to confidence penalty instead of rejection
      score -= 30; // Moderate penalty instead of -100 rejection
    }
  }

  // PHASE 1: Confidence-based competing regions detection
  const currentRegion = topicConfig.region_name.toLowerCase();
  
  // Much more lenient competing region handling
  if (otherRegionalTopics?.length) {
    const competingRegionMatches = otherRegionalTopics
      .filter(other => other.region_name !== topicConfig.region_name)
      .filter(other => {
        const regionName = other.region_name.toLowerCase();
        const regionRegex = new RegExp(`\\b${regionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        return regionRegex.test(text) && 
          !text.includes(`${regionName} to ${currentRegion}`) &&
          !text.includes(`${currentRegion} to ${regionName}`) &&
          !text.includes(`${currentRegion} and ${regionName}`) &&
          !text.includes(`${regionName} and ${currentRegion}`);
      }).length;

    if (competingRegionMatches > 0) {
      // PHASE 1: Light penalty for confidence scoring instead of rejection
      score -= competingRegionMatches * 15; // Much lighter penalty (-15 vs -100)
    }
  }

  // PHASE 1: Enhanced region name matching with base confidence
  const regionName = topicConfig.region_name.toLowerCase();
  const regionNameMatches = (text.match(new RegExp(`\\b${regionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
  
  if (regionNameMatches > 0) {
    score += regionNameMatches * 40; // Higher boost for direct region mentions
  } else {
    // PHASE 1: Base confidence for any content from trusted sources
    score += 25; // Trust the source - give base confidence even without region mention
  }

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

  // PHASE 1: Much lighter negative scoring for competing regions
  if (otherRegionalTopics?.length) {
    const otherRegionTerms = otherRegionalTopics
      .filter(other => other.region_name !== topicConfig.region_name)
      .flatMap(other => [...other.keywords, ...(other.landmarks || []), ...(other.postcodes || [])])
      .filter(term => term && term.length > 2); // Filter short/empty terms
    
    // Light penalty for direct competing region mentions
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
    
    // Light penalty for other specific regional terms
    const negativeMatches = otherRegionTerms.filter(term => 
      text.includes(term.toLowerCase()) && 
      !text.includes(`${term.toLowerCase()} to ${topicConfig.region_name.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} to ${term.toLowerCase()}`) &&
      !text.includes(`${topicConfig.region_name.toLowerCase()} and ${term.toLowerCase()}`) &&
      !text.includes(`${term.toLowerCase()} and ${topicConfig.region_name.toLowerCase()}`)
    ).length;
    
    // PHASE 1: Much lighter penalties for confidence scoring
    score -= directRegionMatches * 10; // Light penalty (-10 vs -50)
    score -= negativeMatches * 5; // Very light penalty (-5 vs -20)
  }

  // Enhanced filtering for national sources - reduce generic geographic boost
  if (sourceType === 'national') {
    // Only give modest boost for very generic terms
    const specificCountryKeywords = ['uk', 'britain', 'british', 'england', 'scotland', 'wales'];
    const specificCountryMatches = specificCountryKeywords.filter(keyword => text.includes(keyword)).length;
    
    if (specificCountryMatches > 0) {
      score += 15; // Baseline country relevance for national sources
    }
    
    // Check for broader geographic context based on topic's region
    const hasCompetingRegions = otherRegionalTopics?.some(other => 
      other.region_name !== topicConfig.region_name && 
      text.includes(other.region_name.toLowerCase())
    );
    
    // Give minimal boost for being in the right general area, only if no competing regions
    if (!hasCompetingRegions) {
      // Look for broader geographic terms that might relate to the topic region
      const broadTerms = topicConfig.landmarks?.concat(topicConfig.organizations || []) || [];
      const broadMatches = broadTerms.filter(term => text.includes(term.toLowerCase())).length;
      
      if (broadMatches > 0) {
        score += 5; // Minimal boost for broad geographic context
      }
    }
  }

  // PHASE 1: Enhanced source trust multipliers
  const sourceMultiplier = {
    'hyperlocal': 2.0, // Strong trust for local sources
    'regional': 1.8,   // High trust for regional sources  
    'national': 1.3    // Modest boost for national sources
  }[sourceType] || 1.0;

  // Apply source multiplier first, then ensure reasonable bounds
  const finalScore = Math.round(score * sourceMultiplier);
  
  // PHASE 1: Much more permissive bounds - trust source selection
  // Minimum score of 15 for any content from trusted sources (user-added sources)
  const confidenceScore = Math.max(15, Math.min(100, finalScore));
  
  // Only return very low scores for content with strong negative signals
  return finalScore < -30 ? Math.max(-30, finalScore) : confidenceScore;
}