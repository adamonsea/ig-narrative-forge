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
 * Enhanced to capture gender, age, and physical characteristics when people are involved
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
          content: `Extract the main visual subject from this story in 15-25 words for image generation.

CRITICAL REQUIREMENTS:
- If the story features a PERSON, you MUST specify: gender (man/woman/boy/girl), approximate age range (young/middle-aged/elderly), and any mentioned physical details
- Focus on concrete visual elements: people with their gender/age, specific places, objects, actions
- Be precise about WHO is doing WHAT and WHERE

Example outputs:
- "elderly man in his 70s sitting alone at a seaside bench overlooking the pier at sunset"
- "young woman in her 30s celebrating outside a restaurant holding a trophy"
- "middle-aged male business owner standing in front of his newly opened shop"

Story text:
${storyText.slice(0, 1500)}`
        }],
        max_tokens: 60,
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
  publicationName?: string,
  primaryColor: string = '#10B981'
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
- LIMITED PALETTE: Black, white, accent color (${primaryColor}) - printed ink aesthetic
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
  publicationName?: string,
  primaryColor?: string
): string {
  // Determine lighting guidance based on tone
  const lightingGuidance = tone.includes('serious') || tone.includes('somber') || tone.includes('urgent')
    ? 'dramatic natural overcast daylight with moody atmospheric depth, creating tension and subdued drama'
    : tone.includes('uplifting') || tone.includes('hopeful') || tone.includes('positive')
    ? 'warm golden hour light with rich contrast and cinematic glow, creating optimistic yet grounded mood'
    : 'dynamic natural daylight with strong shadows and textural contrast';

  // Determine moment/composition guidance
  const momentGuidance = tone.includes('urgent') || tone.includes('tense')
    ? 'captured mid-action with dramatic angles, showing raw movement and visceral energy'
    : tone.includes('somber') || tone.includes('reflective')
    ? 'quiet contemplative moment with cinematic framing, environmental storytelling through gritty textures and weathered details'
    : 'candid authentic moment with dramatic composition, documentary-style environmental storytelling emphasizing raw reality';

  return `Cinematic editorial photography for ${publicationName || 'news publication'}. Subject: ${subject}.

PHOTOREALISTIC MANDATE: Absolutely NO illustration, cartoon, CGI, digital art, or stylized rendering. Must be authentic photojournalism with documentary grit.

CINEMATIC DOCUMENTARY STYLE: 
${lightingGuidance}. Embrace dramatic natural light, strong shadows, and atmospheric depth. Think gritty documentary realism with cinematic composition—not polished studio work. Raw, textured, authentic with visual drama.

DOCUMENTARY MOMENT: ${momentGuidance}. Authentic, unposed, real-world setting with dramatic framing and compelling angles.

VISUAL APPROACH:
- Gritty realism: weathered surfaces, textured environments, raw authenticity
- Dramatic composition: dynamic angles, strong leading lines, cinematic framing
- Environmental drama: atmospheric depth, layered foreground/background, storytelling through setting
- Natural tension: contrast between light and shadow, dramatic but never artificial

TECHNICAL SPECIFICATIONS:
- 35-85mm perspective with slight wide-angle bias for environmental drama
- Shallow to moderate depth of field for cinematic subject isolation
- Modern digital camera quality with rich tonal range and textural detail
- 3:2 landscape aspect ratio (cinematic photojournalism format)

COMPOSITION:
- Cinematic framing: rule of thirds, dynamic diagonals, dramatic perspective
- Environmental storytelling with gritty textural details
- Human scale with dramatic spatial relationships
- Layered composition showing depth and context

VISUAL STYLE REFERENCE: Steve McCurry's dramatic environmental portraits, Sebastião Salgado's gritty social documentary, Magnum Photos' cinematic realism—dramatic yet authentic, gritty yet beautiful, documentary with visual impact.

QUALITY CONTROL CHECKLIST:
✓ Real-world setting with gritty textural authenticity
✓ Dramatic natural lighting with strong shadows
✓ Photorealistic with cinematic composition
✓ Raw materials, weathered textures, environmental drama
✓ Documentary candid moment with visual tension
✓ Cinematic photojournalism aesthetic
✓ Dramatic yet completely realistic

CRITICAL: Must look like it was captured by a master photojournalist seeking the decisive dramatic moment—cinematic composition with documentary authenticity. Gritty realism with visual drama, never losing believability.`;
}
