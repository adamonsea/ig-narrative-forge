/**
 * Prompt enhancement utilities to ensure tone and writing style 
 * properly impact AI content generation
 */

export interface ContentGenerationSettings {
  tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
  writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  audienceExpertise: 'beginner' | 'intermediate' | 'expert';
  slideCount: number;
}

/**
 * Enhances the base prompt with tone and writing style instructions
 */
export const enhancePromptWithSettings = (
  basePrompt: string,
  settings: ContentGenerationSettings
): string => {
  const toneInstructions = {
    formal: "Use formal, professional language with precise terminology. Maintain an authoritative and objective tone throughout.",
    conversational: "Write in a friendly, approachable tone as if speaking directly to the reader. Use natural language and relatable examples.",
    engaging: "Use dynamic, compelling language that captures attention. Include rhetorical questions, vivid descriptions, and emotional hooks.",
    satirical: "Write with wit, irony, and gentle mockery inspired by British satirical journalism (Private Eye, The Day Today). Use understated humor, clever wordplay, and subtle absurdist observations. Channel the spirit of Blackadder's sardonic wit and Monty Python's intelligent absurdism. Mock institutions, bureaucracy, and pretension—not individuals or vulnerable groups. Balance genuine information delivery with humorous commentary that exposes absurdity. Use British cultural references where appropriate (parliamentary terminology, class observations, understatement). Maintain journalistic accuracy while presenting information through a satirical lens.",
    rhyming_couplet: "Write EVERY slide as a rhyming couplet—two lines that rhyme at the end. Channel the wit of Hilaire Belloc, Ogden Nash, and Dr. Seuss. Each couplet must be clever, memorable, and deliver genuine news information. Use iambic rhythm where possible. The humor comes from cramming serious news into playful verse. Headlines should be punchy couplets. Maintain factual accuracy while making the format delightfully absurd."
  };

  const styleInstructions = {
    journalistic: "Structure content using the inverted pyramid format. Lead with the most important information, followed by supporting details and background context.",
    educational: "Break down complex topics into digestible sections. Use clear explanations, examples, and logical progression from basic to advanced concepts.",
    listicle: "Organize information into numbered or bulleted points. Each point should be self-contained with a clear takeaway or actionable insight.",
    story_driven: "Use narrative techniques with a beginning, middle, and end. Include character development, conflict resolution, and emotional resonance."
  };

  const audienceInstructions = {
    beginner: "Assume no prior knowledge. Define technical terms and provide context for all concepts discussed.",
    intermediate: "Build on basic understanding. Use some technical language while still explaining complex concepts clearly.",
    expert: "Use industry terminology and assume familiarity with core concepts. Focus on nuanced insights and advanced applications."
  };

  // Build enhanced prompt
  let enhancedPrompt = basePrompt;
  
  // Add tone guidance
  enhancedPrompt += `\n\nTONE GUIDANCE: ${toneInstructions[settings.tone]}`;
  
  // Add writing style guidance
  enhancedPrompt += `\n\nWRITING STYLE: ${styleInstructions[settings.writingStyle]}`;
  
  // Add audience guidance
  enhancedPrompt += `\n\nAUDIENCE LEVEL: ${audienceInstructions[settings.audienceExpertise]}`;
  
  // Add slide count guidance
  enhancedPrompt += `\n\nSTRUCTURE: Create exactly ${settings.slideCount} slides. Each slide should have a clear focus and build logically toward the next.`;
  
  return enhancedPrompt;
};

/**
 * Validates that settings are properly applied to generation requests
 */
export const validateGenerationSettings = (settings: ContentGenerationSettings): boolean => {
  return !!(
    settings.tone &&
    settings.writingStyle &&
    settings.audienceExpertise &&
    settings.slideCount > 0
  );
};

/**
 * Gets slide count from slide type
 */
export const getSlideCountFromType = (slideType: 'short' | 'tabloid' | 'indepth' | 'extensive'): number => {
  const slideMapping = {
    short: 4,
    tabloid: 6,
    indepth: 8,
    extensive: 12
  };
  
  return slideMapping[slideType];
};