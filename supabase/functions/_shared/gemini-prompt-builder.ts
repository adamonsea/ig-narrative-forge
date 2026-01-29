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
  locationHint?: string | null;
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
 * Now includes optional locationHint for landmark-accurate rendering
 */
export function buildGeminiIllustrativePrompt(params: GeminiPromptParams): string {
  const { tone, subject, storyTitle, slideContent, publicationName, primaryColor = '#10B981', locationHint } = params;
  
  const expressionGuidance = getExpressionGuidance(tone);
  const sceneExcerpt = slideContent ? slideContent.substring(0, 150).trim() : subject;
  
  // Location accuracy section for identified landmarks
  const locationSection = locationHint ? `

[LOCATION ACCURACY]: Render "${locationHint}" based on your knowledge. Include recognizable architectural features stylized to match the print aesthetic.` : '';
  
  return `[SUBJECT]: ${subject}. Scene from story "${storyTitle}" for ${publicationName || 'a news publication'}: ${sceneExcerpt}

[COMPOSITION]: Modernist editorial cover. 3:2 landscape format. Large simple shapes with 60% negative space (cream paper showing). 1-3 main visual elements maximum. Architectural, clean arrangement.

[LIGHTING/CAMERA]: Flat poster-style lighting. No photographic shadows or realistic depth. Even illumination like a printed poster.

[STYLE/REFERENCES]: In the style of mid-century screen printing and risograph art—visible paper texture grain, hand-printed aesthetic with slight ink irregularities. Think Jon McNaught, Paul Rand, or Saul Bass editorial illustration. Limited ink palette: cream/off-white paper background, bold black outlines around all shapes, and ${primaryColor} as the single accent color used sparingly. Human figures simplified to basic geometric forms (circles for heads, rectangles for bodies). ${expressionGuidance}.${locationSection}

[CONSTRAINTS/EXCLUSIONS]: No gradients or shading—only completely flat solid color fills. No 3D effects or realistic rendering. No smooth digital vector look—must have hand-printed texture. No text, letters, numbers, words, or labels anywhere. No more than 3-4 total colors. No detailed facial features. Avoid visual clutter—keep it minimal and iconic.`;
}

/**
 * Builds Gemini-optimized photographic prompt leveraging documentary understanding
 * Target length: 500-700 characters
 * Now includes optional locationHint for landmark-accurate rendering
 */
export function buildGeminiPhotographicPrompt(params: GeminiPromptParams): string {
  const { tone, subject, storyTitle, slideContent, publicationName, locationHint } = params;
  
  const lightingGuidance = getLightingGuidance(tone);
  const momentGuidance = getMomentGuidance(tone);
  
  // Extract scene excerpt (first 150 chars)
  const sceneExcerpt = slideContent ? slideContent.substring(0, 150).trim() : subject;
  
  // Location accuracy section for identified landmarks
  const locationSection = locationHint ? `

Location accuracy: Render "${locationHint}" based on your training knowledge. Include authentic architectural details, proportions, materials, and distinctive visual features as they appear in real photographs.` : '';
  
  return `Cinematic documentary photography for ${publicationName || 'a news publication'} covering: "${storyTitle}"

Subject: ${subject}

The moment: ${momentGuidance} capturing ${sceneExcerpt}

Cinematic approach: ${lightingGuidance}. Dramatic natural light with strong shadows and atmospheric depth. Gritty documentary realism with visual drama—raw, textured, authentic. No studio setup, no harsh flash, only dramatic natural light.${locationSection}

This is cinematic photojournalism in the tradition of Magnum Photos, Steve McCurry's environmental portraits, Sebastião Salgado's gritty social documentary. Environmental storytelling with dramatic framing, weathered textures, and layered composition showing depth. 35-85mm perspective with slight wide-angle bias for dramatic environmental context, modern DSLR quality with rich tonal range. 3:2 landscape format.

Composition approach: Dramatic framing with dynamic angles and strong leading lines. Rule of thirds or diagonal composition creating visual tension. Gritty textural details in foreground/background layers. Clear subject with dramatic spatial relationships and environmental drama. Cinematic yet completely authentic—documentary with visual impact.

Zero tolerance for illustration, CGI, or stylization. Pure photorealistic capture with dramatic composition and gritty authenticity.`;
}
