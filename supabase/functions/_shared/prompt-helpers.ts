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
 * Builds illustrative editorial cartoon prompt with print-made aesthetic
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

  return `PRINT-MADE EDITORIAL ILLUSTRATION for ${publicationName || 'local news publication'}. Subject: ${subject}

CRITICAL AESTHETIC MANDATE - Screen Print / Risograph Style:
- FLAT COLOR FILLS with visible print texture and grain (like risograph or screen print)
- Clean BLACK OUTLINES defining shapes (hand-drawn quality, not digital vector)
- LIMITED PALETTE: Black, white, mint green (#10B981) accents - printed ink aesthetic
- PAPER TEXTURE visible throughout (like printed on newsprint or art paper)
- Slight registration shifts and imperfections (authentic print quality)

COMPOSITION STYLE - Jon McNaught / Edward Hopper Influence:
- Architectural, modernist composition with LARGE SIMPLE SHAPES
- Bold geometric forms filling the frame (buildings, landscapes, objects)
- Strong use of negative space and shadow shapes
- Cinematic perspective with narrative depth

VISUAL APPROACH: ${expressionGuidance}
- Human figures simplified to essential shapes (not detailed faces)
- Environmental storytelling through architecture and setting
- Mood conveyed through composition and light/shadow balance

PRINT TEXTURE REQUIREMENTS (CRITICAL):
- Visible grain structure like risograph or linocut
- Ink texture with slight imperfections and variations
- Hand-crafted feel, NOT smooth digital rendering
- Paper substrate visible in lighter areas

TECHNICAL EXECUTION:
- Bold confident linework (hand-drawn quality)
- Flat color areas with print texture overlay
- High contrast with intentional tonal shifts
- Landscape 3:2 format optimized for editorial cover use

FORBIDDEN ELEMENTS:
❌ Smooth digital gradients or vector perfection
❌ Detailed pen work or cross-hatching
❌ Photorealistic rendering or CGI aesthetics
❌ Text, speech bubbles, or graphic design elements
❌ Childish cartoon style

QUALITY BENCHMARK: Think mid-century editorial illustration meets contemporary screen print art - authentic, textured, print-made aesthetic suitable for serious editorial publication.`;
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
