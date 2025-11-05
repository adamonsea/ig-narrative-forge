/**
 * Shared prompt building helpers for story illustration generation
 * Extracted for DRY code and consistency between illustrative and photographic styles
 */

interface SlideContent {
  content: string;
  type?: string;
}

/**
 * Analyzes story tone using OpenAI to inform expression/mood guidance
 */
export async function analyzeStoryTone(
  slides: SlideContent[],
  openaiKey: string
): Promise<string> {
  if (!openaiKey || slides.length === 0) {
    return 'balanced and informative';
  }

  try {
    const storyText = slides.map(s => s.content).join('\n');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Analyze the emotional tone of this news story in 3-5 words (e.g., "serious and somber", "uplifting and hopeful", "tense and urgent"):\n\n${storyText.slice(0, 1000)}`
        }],
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn('Tone analysis failed, using default');
      return 'balanced and informative';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'balanced and informative';
  } catch (error) {
    console.warn('Error analyzing tone:', error);
    return 'balanced and informative';
  }
}

/**
 * Extracts key visual subject matter from story content using OpenAI
 */
export async function extractSubjectMatter(
  slides: SlideContent[],
  openaiKey: string
): Promise<string> {
  if (!openaiKey || slides.length === 0) {
    return 'local news scene';
  }

  try {
    const storyText = slides.map(s => s.content).join('\n');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Extract the main visual subject from this story in 10-15 words (focus on concrete, visual elements - people, places, objects, actions):\n\n${storyText.slice(0, 1000)}`
        }],
        max_tokens: 40,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn('Subject extraction failed, using default');
      return 'local news scene';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'local news scene';
  } catch (error) {
    console.warn('Error extracting subject:', error);
    return 'local news scene';
  }
}

/**
 * Builds illustrative editorial cartoon prompt (existing style)
 */
export function buildIllustrativePrompt(
  tone: string,
  subject: string,
  publicationName?: string
): string {
  const expressionGuidance = tone.includes('serious') || tone.includes('somber') || tone.includes('urgent')
    ? 'subtle expressions, thoughtful demeanor'
    : tone.includes('uplifting') || tone.includes('hopeful') || tone.includes('positive')
    ? 'warm expressions, engaged demeanor'
    : 'neutral expressions, professional demeanor';

  return `Editorial illustration for ${publicationName || 'local news publication'}. Subject: ${subject}. 
Style: Modern editorial cartoon with bold outlines, flat colors (black, white, mint green #10B981 accents), vector-style illustration. 
Visual approach: ${expressionGuidance}. Clean, minimalist composition with strong focal point.
Requirements: Simple, iconic imagery. No text, no speech bubbles. Adult editorial style (not childish). 
Technical: High contrast, bold lines, limited color palette, suitable for social media carousel cover.`;
}

/**
 * Builds photographic documentary prompt (new photographic style)
 */
export function buildPhotographicPrompt(
  tone: string,
  subject: string,
  publicationName?: string
): string {
  // Determine lighting guidance based on tone
  const lightingGuidance = tone.includes('serious') || tone.includes('somber') || tone.includes('urgent')
    ? 'natural overcast daylight or soft indoor lighting, creating subdued atmosphere'
    : tone.includes('uplifting') || tone.includes('hopeful') || tone.includes('positive')
    ? 'warm golden hour light or bright natural daylight, creating optimistic mood'
    : 'balanced natural daylight or practical indoor lighting';

  // Determine moment/composition guidance
  const momentGuidance = tone.includes('urgent') || tone.includes('tense')
    ? 'captured mid-action, dynamic composition showing movement and energy'
    : tone.includes('somber') || tone.includes('reflective')
    ? 'quiet contemplative moment, still composition with environmental context'
    : 'candid authentic moment, documentary-style environmental storytelling';

  return `Professional editorial photography for ${publicationName || 'news publication'}. Subject: ${subject}.

PHOTOREALISTIC MANDATE: Absolutely NO illustration, cartoon, CGI, digital art, or stylized rendering. Must be authentic photojournalism.

LIGHTING: ${lightingGuidance}. No studio lighting, no harsh flash, no artificial effects.

DOCUMENTARY MOMENT: ${momentGuidance}. Authentic, unposed, real-world setting.

TECHNICAL SPECIFICATIONS:
- 35-85mm perspective (natural field of view, slight compression)
- Natural depth of field (environmental context visible)
- Modern digital camera quality (sharp, clean, professional grade)
- 3:2 landscape aspect ratio (standard photojournalism format)

COMPOSITION:
- Environmental storytelling (show context and setting)
- Rule of thirds or balanced framing
- Human scale and relatability
- Clear subject focus with supporting environmental details

VISUAL STYLE REFERENCE: BBC News photography, Reuters editorial, Guardian photojournalism - modern editorial standards with authentic documentary approach.

QUALITY CONTROL CHECKLIST:
✓ Real-world setting (not studio, not artificial)
✓ Natural lighting only
✓ Photorealistic human features and proportions
✓ Authentic materials and textures
✓ Documentary candid moment (not posed)
✓ Professional news photography aesthetic
✓ Suitable for serious editorial publication

CRITICAL: Must look like it was captured by a professional photojournalist with a DSLR camera. Zero tolerance for illustration, stylization, or artificial rendering.`;
}
