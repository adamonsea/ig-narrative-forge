/**
 * Shared prompt building helpers for story illustration generation
 * Extracted for DRY code and consistency between illustrative and photographic styles
 */

interface SlideContent {
  content: string;
  type?: string;
}

/**
 * Extracts specific location/landmark details from story content
 * Cross-references against known topic landmarks for accurate naming
 * Returns: "Landmark Name (architectural description)" or null
 */
export async function extractLocationDetails(
  slides: SlideContent[],
  openaiKey: string,
  knownLandmarks?: string[],
  region?: string
): Promise<string | null> {
  if (!openaiKey || slides.length === 0) {
    return null;
  }

  try {
    const storyText = slides.map(s => s.content).join('\n');
    const landmarksList = knownLandmarks?.length 
      ? knownLandmarks.join(', ') 
      : 'None specified';
    const regionContext = region || 'UK';
    
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
          content: `Identify any SPECIFIC LOCATION, BUILDING, or LANDMARK mentioned in this story.

KNOWN LOCAL LANDMARKS (use exact name if matched):
${landmarksList}

REGION: ${regionContext}

INSTRUCTIONS:
1. Look for named buildings, venues, parks, streets, or landmarks
2. If a known landmark is mentioned, use its EXACT name from the list
3. Include architectural style/era (e.g., "Victorian pavilion", "Art Deco theatre", "modernist gallery")
4. Note distinctive visual features from public knowledge

RETURN FORMAT (single line):
"[Exact Name] ([architectural style], [distinctive visual features])"

EXAMPLES:
- "Towner Art Gallery (modernist white building with angular facade and floor-to-ceiling windows)"
- "Congress Theatre (Art Deco theatre with curved entrance canopy and distinctive signage)"
- "Seven Sisters cliffs (dramatic white chalk cliffs overlooking English Channel)"
- "Eastbourne Pier (Victorian pleasure pier with ornate ironwork and domed pavilions)"

If NO specific location, building, or landmark is mentioned, return exactly: null

Story text:
${storyText.slice(0, 2000)}`
        }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn('Location extraction failed, skipping');
      return null;
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();
    
    // Handle null or empty responses
    if (!result || result.toLowerCase() === 'null' || result === '') {
      console.log('No specific location identified in story');
      return null;
    }
    
    console.log('Extracted location details:', result);
    return result;
  } catch (error) {
    console.warn('Error extracting location:', error);
    return null;
  }
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
 * Enhanced to capture specific names, roles, gender, age, and physical characteristics
 * Now accepts optional location context to place subjects in authentic settings
 */
export async function extractSubjectMatter(
  slides: SlideContent[],
  openaiKey: string,
  storyTitle?: string,
  locationContext?: string | null
): Promise<string> {
  if (!openaiKey || slides.length === 0) {
    return 'local news scene';
  }

  try {
    const storyText = slides.map(s => s.content).join('\n');
    const titleContext = storyTitle ? `Story Title: ${storyTitle}\n\n` : '';
    
    // Add location context if available
    const locationGuidance = locationContext 
      ? `\nLOCATION CONTEXT (incorporate into scene):
${locationContext}
When this location is relevant, describe the subject IN or NEAR this setting with architectural accuracy.
Example: "Councillor Sarah Thompson, 50s, standing in front of the Art Deco facade of Congress Theatre"\n`
      : '';
    
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
          content: `Extract the main visual subject from this story in 20-35 words for image generation.

CRITICAL REQUIREMENTS:
- INCLUDE SPECIFIC NAMES when mentioned (e.g., "MP Stephen Lloyd", "Chef Gordon Ramsay")
- Include their ROLE or TITLE (MP, councillor, business owner, chef, teacher, etc.)
- Specify gender (man/woman) and approximate age if apparent from context
- SHOW THE STORY, not the announcement—if about flooding, show flood context; if about a new business, show the business in action
- Focus on the PRIMARY person/people in their actual story context
${locationGuidance}
VARIETY NOTE: Avoid defaulting to "speaking at podium/press conference/media scrum" unless the story is specifically about a speech or formal announcement. Prefer showing the subject engaged in the story's real-world context.

Example outputs:
- "MP Stephen Lloyd, middle-aged man, walking through flood-damaged streets talking with affected residents"
- "Chef Gordon Ramsay, 50s, tasting dishes in his restaurant kitchen surrounded by staff"
- "Councillor Sarah Thompson, woman in her 40s, examining architectural plans with the project team"
- "Gallery curator Maria Santos, woman in her 40s, guiding visitors through Towner Art Gallery's bright modernist exhibition space"
- "Local farmer James Wilson, weathered man in his 60s, inspecting storm damage to his barn"
- "Business owner David Chen in his newly renovated cafe interior, arranging furniture before opening"

${titleContext}Story text:
${storyText.slice(0, 2000)}`
        }],
        max_tokens: 80,
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
 * Place-specific accuracy only when story content warrants it
 * Now accepts optional locationHint for landmark-accurate rendering
 */
export function buildIllustrativePrompt(
  tone: string,
  subject: string,
  publicationName?: string,
  primaryColor: string = '#10B981',
  region?: string,
  locationHint?: string | null
): string {
  const expressionGuidance = tone.includes('serious') || tone.includes('somber') || tone.includes('urgent')
    ? 'subtle expressions, thoughtful demeanor'
    : tone.includes('uplifting') || tone.includes('hopeful') || tone.includes('positive')
    ? 'warm expressions, engaged demeanor'
    : 'neutral expressions, professional demeanor';

  // Only add regional guidance if the subject actually mentions local/place elements
  // This prevents e.g. zoo stories getting seaside backgrounds
  const subjectLower = subject.toLowerCase();
  const mentionsLocalPlace = region && (
    subjectLower.includes('seafront') ||
    subjectLower.includes('promenade') ||
    subjectLower.includes('pier') ||
    subjectLower.includes('beach') ||
    subjectLower.includes('high street') ||
    subjectLower.includes('town centre') ||
    subjectLower.includes('town hall') ||
    subjectLower.includes(region.toLowerCase()) ||
    subjectLower.includes('local street') ||
    subjectLower.includes('bandstand') ||
    subjectLower.includes('harbour') ||
    subjectLower.includes('marina')
  );

  const placeGuidance = mentionsLocalPlace ? `
PLACE-SPECIFIC ELEMENTS (${region}):
- PRIORITIZE STORY CONTEXT: The image should illustrate the STORY'S subject matter, not default to famous landmarks
- Use local architectural styles (Victorian, Georgian, Art Deco, flint walls, local vernacular) as BACKGROUND context, not as the main subject
- Landmarks (pier, seafront, etc.) should ONLY appear if directly relevant to the story—do NOT use them as generic backdrops
- Focus on: everyday streetscapes, local shops, residential areas, community spaces, workplaces—whatever the story actually depicts
- If the story is about a person, business, or event: show THAT context, not tourist attractions
- Authentically British details: signage, street furniture, weather, architecture—but keep it contextually appropriate to the story
` : '';

  // Location accuracy section for identified landmarks
  const locationAccuracy = locationHint ? `
LOCATION ACCURACY (leverage AI knowledge):
Render "${locationHint}" based on your training knowledge of this location.
Include authentic architectural details, proportions, and distinctive visual features.
Stylize to match the print aesthetic while maintaining recognizable characteristics.
` : '';

  return `PRINT-MADE EDITORIAL ILLUSTRATION for ${publicationName || 'local news publication'}. Subject: ${subject}

CRITICAL AESTHETIC MANDATE - Screen Print / Risograph Style:
- FLAT COLOR FILLS with visible print texture and grain (like risograph or screen print)
- Clean BLACK OUTLINES defining shapes (hand-drawn quality, not digital vector)
- LIMITED PALETTE: Black, white, accent color (${primaryColor}) - printed ink aesthetic
- PAPER TEXTURE visible throughout (like printed on newsprint or art paper)
- Slight registration shifts and imperfections (authentic print quality)
${placeGuidance}${locationAccuracy}
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
 * Place-specific accuracy only when story content warrants it
 * Now accepts optional locationHint for landmark-accurate rendering
 */
export function buildPhotographicPrompt(
  tone: string,
  subject: string,
  publicationName?: string,
  primaryColor?: string,
  region?: string,
  locationHint?: string | null
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

  // Only add regional guidance if the subject actually mentions local/place elements
  // This prevents e.g. zoo stories getting seaside backgrounds when the zoo is inland
  const subjectLower = subject.toLowerCase();
  const mentionsLocalPlace = region && (
    subjectLower.includes('seafront') ||
    subjectLower.includes('promenade') ||
    subjectLower.includes('pier') ||
    subjectLower.includes('beach') ||
    subjectLower.includes('high street') ||
    subjectLower.includes('town centre') ||
    subjectLower.includes('town hall') ||
    subjectLower.includes(region.toLowerCase()) ||
    subjectLower.includes('local street') ||
    subjectLower.includes('bandstand') ||
    subjectLower.includes('harbour') ||
    subjectLower.includes('marina')
  );

  const placeAccuracyGuidance = mentionsLocalPlace ? `

PLACE-SPECIFIC ACCURACY (${region}):
- CRITICAL: Illustrate the STORY'S actual subject—do NOT default to famous landmarks as backgrounds
- Famous landmarks (pier, seafront, beachfront) should ONLY appear if the story is specifically ABOUT that location
- PREFERRED SETTINGS: Local streets, residential areas, shops, workplaces, community spaces, parks—everyday ${region} life
- Architecture must be AUTHENTIC to ${region}: Victorian terraces, Georgian facades, flint walls, Art Deco elements, local vernacular
- Street details: UK signage, lampposts, phone boxes, bus stops, shop fronts—authentic British urban/suburban context
- If story is about a PERSON: focus on their environment (office, shop, home, meeting venue)—not tourist attractions
- If story is about a BUSINESS: show the business context, not the seafront
- If story is about an EVENT: show the event venue/activity, not landmarks
- Weather and light: UK climate—overcast, soft light, occasional dramatic coastal light when genuinely appropriate
- ONLY use coastal elements (pier, promenade, beach) when the story EXPLICITLY involves the seafront
` : '';

  // Location accuracy section for identified landmarks
  const locationAccuracy = locationHint ? `

LOCATION ACCURACY (leverage AI knowledge):
Render "${locationHint}" based on your training knowledge of this location.
Include authentic architectural details, proportions, materials, and distinctive visual features.
Capture the real-world appearance as it would be photographed on location.
` : '';

  return `Cinematic editorial photography for ${publicationName || 'news publication'}. Subject: ${subject}.

PHOTOREALISTIC MANDATE: Absolutely NO illustration, cartoon, CGI, digital art, or stylized rendering. Must be authentic photojournalism with documentary grit.
${placeAccuracyGuidance}${locationAccuracy}
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
${mentionsLocalPlace ? `✓ Architecture and setting authentic to ${region}` : ''}

CRITICAL: Must look like it was captured by a master photojournalist seeking the decisive dramatic moment—cinematic composition with documentary authenticity. Gritty realism with visual drama, never losing believability.`;
}
