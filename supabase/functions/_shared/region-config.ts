import { RegionConfig } from './types.ts';

export const REGION_CONFIGS: Record<string, RegionConfig> = {
  'Eastbourne': {
    name: 'Eastbourne',
    keywords: ['eastbourne', 'seaford', 'hailsham', 'polegate', 'willingdon', 'beachy head'],
    landmarks: ['beachy head', 'seven sisters', 'south downs', 'eastbourne pier', 'devonshire park', 'congress theatre', 'towner gallery', 'redoubt fortress', 'airbourne', 'eastbourne college'],
    postcodes: ['bn20', 'bn21', 'bn22', 'bn23', 'bn24', 'bn25', 'bn26', 'bn27'],
    organizations: ['eastbourne borough council', 'east sussex fire', 'sussex police', 'eastbourne district general', 'rnli eastbourne', 'eastbourne town fc']
  },
  'Brighton': {
    name: 'Brighton',
    keywords: ['brighton', 'hove', 'preston', 'kemp town', 'hanover', 'brunswick'],
    landmarks: ['brighton pier', 'royal pavilion', 'preston park', 'devil\'s dyke', 'brighton marina', 'lanes', 'north laine'],
    postcodes: ['bn1', 'bn2', 'bn3', 'bn41', 'bn42', 'bn50', 'bn51', 'bn52'],
    organizations: ['brighton & hove city council', 'sussex police', 'royal sussex county hospital', 'amex stadium', 'brighton fc']
  }
};

export function calculateRegionalRelevance(
  content: string,
  title: string,
  region: string,
  sourceType: string = 'national'
): number {
  const config = REGION_CONFIGS[region];
  if (!config) return 0;

  const text = `${title} ${content}`.toLowerCase();
  let score = 0;

  // Keyword matching (base score)
  const keywordMatches = config.keywords.filter(keyword => 
    text.includes(keyword.toLowerCase())
  ).length;
  score += keywordMatches * 10;

  // Landmark matching (higher weight)
  const landmarkMatches = config.landmarks.filter(landmark => 
    text.includes(landmark.toLowerCase())
  ).length;
  score += landmarkMatches * 15;

  // Postcode matching (very specific)
  const postcodeMatches = config.postcodes.filter(postcode => 
    text.includes(postcode.toLowerCase())
  ).length;
  score += postcodeMatches * 20;

  // Organization matching (institutional relevance)
  const orgMatches = config.organizations.filter(org => 
    text.includes(org.toLowerCase())
  ).length;
  score += orgMatches * 12;

  // Source type bonus
  const sourceMultiplier = {
    'hyperlocal': 1.5,
    'regional': 1.2,
    'national': 1.0
  }[sourceType] || 1.0;

  return Math.round(score * sourceMultiplier);
}