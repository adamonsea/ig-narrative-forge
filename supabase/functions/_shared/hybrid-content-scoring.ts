// Hybrid content scoring system for topics
// Uses regional relevance for 'regional' topics and keyword scoring for 'keyword' topics

import { calculateRegionalRelevance, TopicRegionalConfig } from './region-config.ts';

export interface TopicConfig {
  id: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  negative_keywords?: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
}

export interface ContentScore {
  relevance_score: number;
  method: 'regional' | 'keyword';
  details: {
    keyword_matches?: { keyword: string; count: number }[];
    regional_details?: any;
  };
}

/**
 * Calculate content relevance for a topic using hybrid approach
 */
export function calculateTopicRelevance(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): ContentScore {
  if (topicConfig.topic_type === 'regional' && topicConfig.region) {
    // Use user-defined regional configuration
    const regionalConfig: TopicRegionalConfig = {
      keywords: topicConfig.keywords,
      landmarks: topicConfig.landmarks,
      postcodes: topicConfig.postcodes,
      organizations: topicConfig.organizations,
      region_name: topicConfig.region
    };
    
    const regionalScore = calculateRegionalRelevance(
      content, 
      title, 
      regionalConfig,
      sourceType,
      otherRegionalTopics,
      sourceUrl
    );
    
    return {
      relevance_score: regionalScore,
      method: 'regional',
      details: {
        regional_details: {
          region: topicConfig.region,
          source_type: sourceType,
          user_defined: true
        }
      }
    };
  } else {
    // Use simple keyword-based scoring for general topics
    const keywordScore = calculateKeywordRelevance(content, title, topicConfig.keywords);
    
    return {
      relevance_score: keywordScore.score,
      method: 'keyword',
      details: {
        keyword_matches: keywordScore.matches
      }
    };
  }
}

/**
 * Enhanced keyword-based relevance scoring with better matching
 */
function calculateKeywordRelevance(
  content: string,
  title: string,
  keywords: string[]
): { score: number; matches: { keyword: string; count: number }[] } {
  if (!keywords || keywords.length === 0) {
    return { score: 0, matches: [] };
  }

  const fullText = `${title} ${content}`.toLowerCase();
  const matches: { keyword: string; count: number }[] = [];
  let totalScore = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!normalizedKeyword) continue;

    // Generate keyword variations for better matching
    const keywordVariations = generateKeywordVariations(normalizedKeyword);
    let keywordScore = 0;
    let keywordOccurrences = 0;

    for (const variation of keywordVariations) {
      // Use only exact word boundary matching for accurate keyword detection
      const exactRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      
      const exactMatches = (fullText.match(exactRegex) || []).length;
      const occurrences = exactMatches;
      keywordOccurrences += occurrences;

      if (occurrences > 0) {
        // Context-aware scoring: title, first paragraph, and headings get bonus
        const titleText = title.toLowerCase();
        const firstParagraph = content.substring(0, 500).toLowerCase();
        
        const titleExactMatches = (titleText.match(exactRegex) || []).length;
        const firstParaMatches = (firstParagraph.match(exactRegex) || []).length;
        
        // Enhanced scoring system
        const titleScore = titleExactMatches * 15; // Higher weight for title
        const firstParaScore = Math.min(firstParaMatches * 8, 24); // Bonus for early mentions
        const contentScore = Math.min((occurrences - titleExactMatches - firstParaMatches) * 3, 15);
        
        keywordScore += titleScore + firstParaScore + contentScore;
      }
    }

    if (keywordOccurrences > 0) {
      matches.push({ keyword, count: keywordOccurrences });
      totalScore += keywordScore;
    }
  }

  // PLATFORM FIX: Much more generous scoring to reduce false negatives
  let normalizedScore = Math.min(Math.round(totalScore * 2.5), 100); // Increased multiplier
  
  // Higher bonus for multiple different keywords matching
  if (matches.length > 1) {
    normalizedScore = Math.min(normalizedScore + (matches.length - 1) * 10, 100);
  }
  
  // Additional bonus for any keyword match to be more permissive
  if (matches.length > 0) {
    normalizedScore = Math.max(normalizedScore, 15); // Minimum score for any keyword match
  }
  
  // Add debug logging to show what keywords were actually matched
  console.log('Keyword matching debug:', {
    keywords,
    matches: matches.map(m => ({ keyword: m.keyword, count: m.count })),
    score: normalizedScore,
    title: title.substring(0, 100) + '...'
  });
  
  return {
    score: normalizedScore,
    matches
  };
}

/**
 * Generate keyword variations for better matching
 */
function generateKeywordVariations(keyword: string): string[] {
  const variations = [keyword];
  
  // Add plural/singular variations
  if (keyword.endsWith('s') && keyword.length > 3) {
    variations.push(keyword.slice(0, -1)); // Remove 's'
  } else {
    variations.push(keyword + 's'); // Add 's'
  }
  
  // Add common word variations for film/movie keywords
  const filmSynonyms: { [key: string]: string[] } = {
    'film': ['movie', 'cinema', 'picture'],
    'movie': ['film', 'cinema', 'picture'],
    'children': ['kids', 'child', 'youth', 'young'],
    'kids': ['children', 'child', 'youth', 'young'],
    'family': ['families', 'parent', 'child'],
    'animation': ['animated', 'cartoon', 'anime'],
    'documentary': ['doc', 'docu', 'factual']
  };
  
  if (filmSynonyms[keyword]) {
    variations.push(...filmSynonyms[keyword]);
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Determine minimum relevance threshold based on topic type and source
 */
export function getRelevanceThreshold(
  topicType: 'regional' | 'keyword',
  sourceType: string = 'national'
): number {
  // PLATFORM FIX: Much more permissive thresholds to reduce 85-95% discard rate
  if (topicType === 'regional') {
    // Regional content thresholds - very permissive to let more content through
    if (sourceType === 'hyperlocal') return 5; // Local sources extremely lenient
    if (sourceType === 'regional') return 8; // Regional sources very permissive
    return 10; // National sources still quite lenient
  } else {
    // Keyword-based thresholds - very lenient since keyword matching can vary
    if (sourceType === 'hyperlocal') return 5; // Local content can be relevant with lower scores
    if (sourceType === 'regional') return 8; // Regional sources slight increase
    return 10; // National sources need very low keyword relevance
  }
}

/**
 * Check if content meets topic relevance requirements
 */
export function meetsTopicRelevance(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): boolean {
  // Check for negative keywords first - immediate disqualification
  if (topicConfig.negative_keywords?.length) {
    const text = `${title} ${content}`.toLowerCase();
    const hasNegativeKeyword = topicConfig.negative_keywords.some(negKeyword => 
      text.includes(negKeyword.toLowerCase())
    );
    
    if (hasNegativeKeyword) {
      return false; // Immediate rejection for negative keywords
    }
  }

  const score = calculateTopicRelevance(content, title, topicConfig, sourceType, otherRegionalTopics, sourceUrl);
  const threshold = getRelevanceThreshold(topicConfig.topic_type, sourceType);
  
  // For regional topics, also check for competing region exclusion
  if (topicConfig.topic_type === 'regional' && score.relevance_score > 0) {
    // Additional check: content should not be primarily about other regions
    const hasStrongCompetingRegionSignals = checkForCompetingRegionSignals(
      content, 
      title, 
      topicConfig, 
      otherRegionalTopics
    );
    
    if (hasStrongCompetingRegionSignals) {
      return false; // Exclude content that's clearly about other regions
    }
  }
  
  return score.relevance_score >= threshold && score.relevance_score > 0;
}

/**
 * Check for strong signals that content is primarily about competing regions
 */
function checkForCompetingRegionSignals(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  otherRegionalTopics: TopicRegionalConfig[]
): boolean {
  if (!otherRegionalTopics?.length || !topicConfig.region) return false;
  
  const fullText = `${title} ${content}`.toLowerCase();
  const currentRegion = topicConfig.region.toLowerCase();
  
  // Check for competing region names in title (strong signal)
  const competingRegionsInTitle = otherRegionalTopics
    .filter(other => other.region_name !== topicConfig.region)
    .filter(other => title.toLowerCase().includes(other.region_name.toLowerCase()))
    .length;
  
  if (competingRegionsInTitle > 0) {
    // Allow if current region is also mentioned prominently
    const currentRegionInTitle = title.toLowerCase().includes(currentRegion);
    if (!currentRegionInTitle) {
      return true; // Strong competing signal - exclude
    }
  }
  
  // Check landmark concentration (competing region landmarks mentioned more than current)
  const competingLandmarkMentions = otherRegionalTopics
    .filter(other => other.region_name !== topicConfig.region)
    .flatMap(other => other.landmarks || [])
    .filter(landmark => landmark && fullText.includes(landmark.toLowerCase()))
    .length;
  
  const currentLandmarkMentions = (topicConfig.landmarks || [])
    .filter(landmark => landmark && fullText.includes(landmark.toLowerCase()))
    .length;
  
  // If competing landmarks mentioned significantly more than current region landmarks
  if (competingLandmarkMentions > currentLandmarkMentions && competingLandmarkMentions >= 2) {
    return true; // Strong competing signal - exclude
  }
  
  return false;
}