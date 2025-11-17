/**
 * Generic keyword templates for regional topics
 * These are proven keywords that work across multiple regional topics
 */

export const GENERIC_REGIONAL_KEYWORDS = {
  // Tier 1: Universal keywords that work for virtually any region
  tier1_universal: [
    'crime',
    'police',
    'community',
    'council',
    'planning',
    'events',
    'fire',
    'ambulance',
    'court',
    'development',
    'housing',
    'transport',
    'business',
    'health',
    'education',
    'schools',
    'hospital',
    'traffic',
    'parking',
    'shops',
  ],

  // Tier 2: Regional templates that include the region name
  tier2_regional_templates: [
    '{region} news',
    '{region} community',
    '{region} crime',
    '{region} council',
    '{region} events',
    '{region} planning',
    '{region} development',
    '{region} business',
    '{region} town centre',
    '{region} high street',
    '{region} tourism',
    '{region} transport',
    '{region} regeneration',
  ],

  // Tier 3: Contextual keywords based on region characteristics
  tier3_contextual: {
    coastal: ['pier', 'seafront', 'beach', 'promenade', 'harbour', 'marina'],
    urban: ['town centre', 'high street', 'regeneration', 'nightlife'],
    suburban: ['local shops', 'neighbourhood', 'residents'],
    rural: ['countryside', 'village', 'parish', 'farming'],
  },
};

/**
 * Generate regional keywords for a given region name
 * @param regionName - The name of the region (e.g., "Eastbourne", "Brighton")
 * @param context - Optional context about the region type
 * @returns Array of generated keywords
 */
export function generateRegionalKeywords(
  regionName: string,
  context?: 'coastal' | 'urban' | 'suburban' | 'rural'
): string[] {
  const regionLower = regionName.toLowerCase().trim();
  
  const keywords = [
    ...GENERIC_REGIONAL_KEYWORDS.tier1_universal,
    ...GENERIC_REGIONAL_KEYWORDS.tier2_regional_templates.map(template =>
      template.replace('{region}', regionLower)
    ),
  ];

  // Add contextual keywords if specified
  if (context && GENERIC_REGIONAL_KEYWORDS.tier3_contextual[context]) {
    keywords.push(...GENERIC_REGIONAL_KEYWORDS.tier3_contextual[context]);
  }

  return keywords;
}

/**
 * Check if a keyword is in the generic template list
 * Used to avoid suggesting keywords that are already auto-populated
 */
export function isGenericKeyword(keyword: string): boolean {
  const keywordLower = keyword.toLowerCase().trim();
  return GENERIC_REGIONAL_KEYWORDS.tier1_universal.some(
    k => k.toLowerCase() === keywordLower
  );
}
