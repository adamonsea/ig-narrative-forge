/**
 * Gemini-specific prompt builders leveraging model's world knowledge and narrative reasoning
 * Optimized for Gemini 2.5 Flash Image's preference for descriptive storytelling over rule lists
 */

interface GeminiPromptParams {
  tone: string;
  subject: string;
  storyTitle: string;
  slideContent: string;
  publicationName?: string;
  primaryColor?: string;
}

/**
 * Get expression guidance based on story tone
 */
function getExpressionGuidance(tone: string): string {
  const toneLower = tone.toLowerCase();
  
  if (toneLower.includes('serious') || toneLower.includes('somber')) {
    return 'Contemplative and composed, with subjects showing gravitas and thoughtful demeanor';
  }
  if (toneLower.includes('uplifting') || toneLower.includes('hopeful') || toneLower.includes('positive')) {
    return 'Warm and hopeful, with open body language and optimistic energy';
  }
  if (toneLower.includes('urgent') || toneLower.includes('tense')) {
    return 'Dynamic and energetic, suggesting motion or tension in the moment';
  }
  if (toneLower.includes('reflective') || toneLower.includes('contemplative')) {
    return 'Quiet and introspective, with careful subject placement and subdued energy';
  }
  
  return 'Professional and balanced, with subjects engaged in the story moment';
}

/**
 * Get tonal composition guidance
 */
function getTonalGuidance(tone: string): string {
  const toneLower = tone.toLowerCase();
  
  if (toneLower.includes('serious') || toneLower.includes('somber')) {
    return 'through subdued composition with careful subject placement and contemplative atmosphere';
  }
  if (toneLower.includes('uplifting') || toneLower.includes('hopeful')) {
    return 'with optimistic visual flow and generous breathing space suggesting possibility';
  }
  if (toneLower.includes('urgent') || toneLower.includes('tense')) {
    return 'through angular composition and directed visual energy showing momentum';
  }
  
  return 'through balanced composition with clear visual hierarchy';
}

/**
 * Get lighting guidance for photographic style
 */
function getLightingGuidance(tone: string): string {
  const toneLower = tone.toLowerCase();
  
  if (toneLower.includes('serious') || toneLower.includes('somber') || toneLower.includes('urgent')) {
    return 'Natural overcast daylight creating subdued, contemplative atmosphere';
  }
  if (toneLower.includes('uplifting') || toneLower.includes('hopeful') || toneLower.includes('positive')) {
    return 'Warm golden hour light suggesting optimism and possibility';
  }
  if (toneLower.includes('reflective') || toneLower.includes('contemplative')) {
    return 'Soft diffused natural light creating quiet, introspective mood';
  }
  
  return 'Balanced natural daylight with even illumination';
}

/**
 * Get moment description for photographic style
 */
function getMomentGuidance(tone: string): string {
  const toneLower = tone.toLowerCase();
  
  if (toneLower.includes('urgent') || toneLower.includes('tense')) {
    return 'candid mid-action showing energy and movement';
  }
  if (toneLower.includes('somber') || toneLower.includes('reflective')) {
    return 'quiet contemplative moment with environmental storytelling';
  }
  if (toneLower.includes('uplifting') || toneLower.includes('hopeful')) {
    return 'authentic engaged moment showing human connection and activity';
  }
  
  return 'documentary candid moment capturing authentic human experience';
}

/**
 * Builds Gemini-optimized illustrative prompt leveraging world knowledge
 * Target length: 600-800 characters
 */
export function buildGeminiIllustrativePrompt(params: GeminiPromptParams): string {
  const { tone, subject, storyTitle, slideContent, publicationName, primaryColor = '#10B981' } = params;
  
  const expressionGuidance = getExpressionGuidance(tone);
  const tonalGuidance = getTonalGuidance(tone);
  
  // Extract scene excerpt (first 180 chars to stay within target length)
  const sceneExcerpt = slideContent ? slideContent.substring(0, 180).trim() : subject;
  
  return `⚠️ ABSOLUTE REQUIREMENT - ZERO TEXT IN IMAGE ⚠️
NO letters, words, numbers, signs, labels, venue names, dates, or any typographic elements whatsoever. This is NOT a poster or flyer - it is pure visual storytelling without text.

You're creating an editorial illustration for ${publicationName || 'a news publication'} in the style of Jon McNaught, Guardian editorial covers, or New Yorker spot illustrations.

Story: "${storyTitle}" about ${subject}

Visual story: ${sceneExcerpt}

The illustration should feel: ${expressionGuidance} ${tonalGuidance}

Visual Language: Bold editorial cartoon with FLAT COLOR FILLS and clean black outlines—screen print aesthetic, not detailed pen work. Large, simple geometric shapes. Architectural, modernist composition with clear focal points.

Color Palette: Predominantly white negative space (60%+) with solid black areas and exactly ONE accent color (${primaryColor}) as flat color block on story-relevant object. NO gradients, textures, or intricate details—clean, bold shapes only.

Composition: 3:2 landscape format. 1-3 large iconic forms maximum—prioritize SIMPLE, BOLD shapes over detailed rendering. Strategic negative space for balance and visual breathing room, not random emptiness. Edge-to-edge composition with no borders.

REMINDER - TEXT IS FORBIDDEN:
If the subject involves signage, buildings, or venues: show them WITHOUT readable text - use blank shapes, geometric patterns, or symbolic representations instead of letters.

Capture this moment with clean minimalist sophistication—say more with less. Adult editorial aesthetic for serious journalism.`;
}

/**
 * Builds Gemini-optimized photographic prompt leveraging documentary understanding
 * Target length: 500-700 characters
 */
export function buildGeminiPhotographicPrompt(params: GeminiPromptParams): string {
  const { tone, subject, storyTitle, slideContent, publicationName } = params;
  
  const lightingGuidance = getLightingGuidance(tone);
  const momentGuidance = getMomentGuidance(tone);
  
  // Extract scene excerpt (first 150 chars)
  const sceneExcerpt = slideContent ? slideContent.substring(0, 150).trim() : subject;
  
  return `Cinematic documentary photography for ${publicationName || 'a news publication'} covering: "${storyTitle}"

Subject: ${subject}

The moment: ${momentGuidance} capturing ${sceneExcerpt}

Cinematic approach: ${lightingGuidance}. Dramatic natural light with strong shadows and atmospheric depth. Gritty documentary realism with visual drama—raw, textured, authentic. No studio setup, no harsh flash, only dramatic natural light.

This is cinematic photojournalism in the tradition of Magnum Photos, Steve McCurry's environmental portraits, Sebastião Salgado's gritty social documentary. Environmental storytelling with dramatic framing, weathered textures, and layered composition showing depth. 35-85mm perspective with slight wide-angle bias for dramatic environmental context, modern DSLR quality with rich tonal range. 3:2 landscape format.

Composition approach: Dramatic framing with dynamic angles and strong leading lines. Rule of thirds or diagonal composition creating visual tension. Gritty textural details in foreground/background layers. Clear subject with dramatic spatial relationships and environmental drama. Cinematic yet completely authentic—documentary with visual impact.

Zero tolerance for illustration, CGI, or stylization. Pure photorealistic capture with dramatic composition and gritty authenticity.`;
}
