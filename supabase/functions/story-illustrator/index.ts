import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { storyId, model = 'gpt-image-1' } = await req.json()

    if (!storyId) {
      return new Response(
        JSON.stringify({ error: 'Story ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get story details
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single()

    if (storyError || !story) {
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch all slides for the story to analyze full narrative
    const { data: slides, error: slidesError } = await supabase
      .from('slides')
      .select('content, slide_number')
      .eq('story_id', storyId)
      .order('slide_number', { ascending: true })

    if (slidesError) {
      console.error('Error fetching slides:', slidesError)
    }

    // Weight early slides more heavily for illustration - first 3 slides are primary narrative
    const slideContent = slides?.map((s, idx) => {
      const weight = idx < 3 ? '' : '(background context: ';
      const suffix = idx < 3 ? '' : ')';
      return `${weight}${s.content}${suffix}`;
    }).join('\n\n') || '';
    console.log('Fetched slide content for cover generation:', slideContent ? `${slideContent.length} chars` : 'No slides found')

    // Allow regeneration - don't check if illustration already exists
    // This enables the regenerate functionality

    // Helper function to safely convert large images to base64
    const safeBase64Encode = (uint8Array: Uint8Array): string => {
      const chunkSize = 0x8000; // 32KB chunks
      let result = '';
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        result += String.fromCharCode(...chunk);
      }
      
      return btoa(result);
    };

    // Determine credit cost based on model - three-tier structure
    const getModelConfig = (modelName: string) => {
      const stylePrefix = "Sharp contemporary editorial illustration. Professional graphic journalism. Sophisticated adult audience. NOT cartoon, NOT childlike, NOT whimsical. ";
      
      switch (modelName) {
        case 'gpt-image-1':
          return { credits: 8, cost: 0.06, provider: 'openai', stylePrefix };
        case 'flux-dev':
          return { credits: 3, cost: 0.025, provider: 'replicate-flux', stylePrefix };
        case 'gemini-image':
          return { credits: 1, cost: 0.005, provider: 'lovable-gemini', stylePrefix };
        default:
          return { credits: 8, cost: 0.06, provider: 'openai', stylePrefix };
      }
    };

    const modelConfig = getModelConfig(model);

    // Check if user is super admin (bypass credit deduction)
    const { data: hasAdminRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'superadmin'
    })
    
    const isSuperAdmin = hasAdminRole === true
    let creditResult = null

    // Deduct credits based on model - skip for super admin
    if (!isSuperAdmin) {
      const { data: result, error: creditError } = await supabase.rpc('deduct_user_credits', {
        p_user_id: user.id,
        p_credits_amount: modelConfig.credits,
        p_description: `Story illustration generation (${model})`,
        p_story_id: storyId
      })

      creditResult = result

      if (creditError || !creditResult?.success) {
        return new Response(
          JSON.stringify({ 
            error: creditResult?.error || 'Failed to deduct credits',
            credits_required: modelConfig.credits
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    // First, analyze the story tone to determine appropriate visual mood
    const toneAnalysisPrompt = `Analyze this news story and determine the appropriate emotional tone for an editorial cartoon:

HEADLINE: "${story.title}"

STORY NARRATIVE:
${slideContent || 'No additional context available'}

Based on both the headline and the full narrative, respond with ONE word only from: serious, lighthearted, playful, contentious, somber`;

    let storyTone = 'balanced'; // fallback
    
    // Use OpenAI for tone analysis if available
    if (Deno.env.get('OPENAI_API_KEY')) {
      try {
        const toneResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an editorial cartoon expert who assesses story tone.' },
              { role: 'user', content: toneAnalysisPrompt }
            ],
            max_tokens: 10,
            temperature: 0.3
          }),
        });
        
        if (toneResponse.ok) {
          const toneData = await toneResponse.json();
          storyTone = toneData.choices[0]?.message?.content?.trim().toLowerCase() || 'balanced';
        }
      } catch (error) {
        console.error('Tone analysis failed, using balanced tone:', error);
      }
    }

    // Map tone to expression guidance emphasizing variety
    const toneGuidance: Record<string, string> = {
      serious: 'range of engaged expressions showing concentration, concern, or contemplation - variety in how different characters process serious subject matter',
      lighthearted: 'variety of natural, relaxed expressions - gentle engagement with the subject, comfortable and accessible',
      playful: 'diverse upbeat expressions showing different ways people engage with lighter subjects - varied energy levels',
      contentious: 'range of animated expressions showing debate, discussion, or strong feelings - variety in how people express disagreement or passion',
      somber: 'varied reflective expressions - different ways people show gravity, from quiet thought to visible emotion',
      balanced: 'natural variety in expressions - show multiple characters or moments with different emotional responses to the same subject'
    };

    const expressionInstruction = toneGuidance[storyTone] || toneGuidance['balanced'];

    // Second, analyze the story subject matter to extract key visual elements
    const subjectAnalysisPrompt = `Analyze this news story and extract key visual elements for an editorial illustration:

HEADLINE: "${story.title}"

FULL STORY NARRATIVE:
${slideContent || 'No additional context available'}

Based on the complete story (not just the headline), identify and list in 3-4 concise sentences:
1. Primary subject matter and specific angle taken in the narrative
2. Unique visual elements emphasized in the story (objects, activities, settings, people)
3. Setting details, atmosphere, and regional context
4. Any specific details or moments that make THIS story distinctive

Focus on concrete visual details from the FULL narrative that would make an illustration immediately recognizable as THIS specific story with THIS particular angle.`;

    let subjectMatter = 'contemporary scene related to the story'; // fallback
    
    // Extract subject matter using OpenAI
    if (Deno.env.get('OPENAI_API_KEY')) {
      try {
        const subjectResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an expert at identifying visual elements in news stories for illustration purposes.' },
              { role: 'user', content: subjectAnalysisPrompt }
            ],
            max_tokens: 150,
            temperature: 0.4
          }),
        });
        
        if (subjectResponse.ok) {
          const subjectData = await subjectResponse.json();
          subjectMatter = subjectData.choices[0]?.message?.content?.trim() || subjectMatter;
          console.log('Subject matter extracted:', subjectMatter);
        }
      } catch (error) {
        console.error('Subject analysis failed, using generic fallback:', error);
      }
    }

    // Generate optimized illustration prompt with subject-first structure
    const illustrationPrompt = `${modelConfig.stylePrefix}

Create a contemporary editorial cartoon illustration. NO TEXT, NO WORDS, NO LETTERS, NO SENTENCES, NO PHRASES anywhere in the image.

[VISUAL STYLE: ligne claire, clean line art, bold outline drawing, Hergé Tintin style, minimal detail, no crosshatching, no texture, outline only]

SUBJECT MATTER - PRIMARY FOCUS (analyzed from full story):
${subjectMatter}

Story headline: "${story.title}"
(Note: This illustration is based on analysis of the complete story narrative, not just the headline)

VISUAL CONCEPT:
Illustrate the core subject identified above, drawing primarily from the opening narrative while using later details for background context. Show the story through varied character expressions and body language - different people respond differently to the same situation. The scene should immediately communicate what this story is about through specific visual elements (objects, activities, settings, character interactions) rather than generic representations. Focus on the unique aspects that distinguish this story.

          STYLE & COMPOSITION:
          Bold outline-driven editorial cartoon with DRAMATIC LINE WEIGHT VARIATION (essential for hand-drawn personality). Channel the ARTISTIC PERSONALITY of master editorial cartoonists: David Levine's confident NYT caricature strokes (thick to thin), Ronald Searle's expressive British wit (nervous energy in linework), Ralph Steadman's controlled chaos (bold decisive marks), Ben Shahn's social realist confidence. Draw with the ENERGY of a skilled editorial cartoonist working on deadline - some lines THICK and bold, others THIN and delicate. 
          
          TWO-COLOR PRINT AESTHETIC: Primary black ink (#000000) for all linework + MANDATORY fine halftone texture, PLUS minimal bright mint green (#58FFBC) as SPARSE highlight accents only (10-15% coverage maximum). White (#FFFFFF) background. Reference PRINT AESTHETIC: Jon McNaught's duotone screen print storytelling (masterful highlight/shadow balance through limited color), Risograph zine style, vintage screen print posters, punk DIY print culture. Solid black shadow shapes (no hatching/crosshatching).

RENDERING PERSONALITY REQUIREMENTS - CRITICAL:
          No shading. No hatching. No crosshatching. No stippling. No gradients. Just VARIED-WEIGHT black outlines, solid black fills, MANDATORY visible halftone texture in shadows/mid-tones, and minimal green highlight accents. Visual interest comes from DRAMATIC LINE WEIGHT VARIATION, confident hand-drawn energy, halftone grain texture, and sparse strategic green pops.
          
          STROKE WEIGHT HIERARCHY (thickest to thinnest):
          1. Main foreground figure outlines: THICK bold strokes (3-4x baseline weight) - commanding presence
          2. Important objects/focal points: MEDIUM-THICK strokes (2-3x baseline) - visual emphasis
          3. Secondary elements: MEDIUM strokes (1.5-2x baseline) - supporting cast
          4. Background elements: THIN strokes (0.5-1x baseline) - atmospheric depth
          5. Delicate details (facial features, hands): THIN elegant strokes (0.3-0.5x baseline) - precision and sophistication

          HALFTONE TEXTURE - CRITICAL REQUIREMENT (MUST BE VISIBLE):
          - Channel Jon McNaught's approach: halftone texture emphasizes SHADOWS and depth, while green provides HIGHLIGHT pops
          - YOU MUST apply fine mechanical halftone dot pattern to ALL shadow areas and mid-tones
          - Texture density: 60-80 LPI (lines per inch) - fine but CLEARLY VISIBLE grain texture
          - PRIMARY USE: Shadow emphasis - use halftone dots to create depth in shadows, darker areas, recessed spaces
          - Apply halftone to: ALL shadow fills (under objects, behind figures, in clothing folds), mid-tone areas for tonal variation, background fill areas for atmosphere, architectural shadow surfaces
          - Halftone is NOT optional - it MUST appear in the final image as visible dot texture in shadow/mid-tone areas
          - Think vintage newsprint reproduction or risograph shadow printing - the dots should be apparent
          - Contrast: Pure white highlights → Light halftone mid-tones → Dense halftone shadows → Solid black deepest darks
          - Green areas remain SOLID flat color (no halftone in green)

          GREEN SPOT COLOR (#58FFBC) - MINIMAL HIGHLIGHT ACCENTS ONLY (Jon McNaught duotone method):
          - Use bright mint green SPARINGLY - only 1-3 small accent areas per composition (10-15% coverage maximum)
          - Think McNaught's second color: strategic highlight placement that tells the story through color contrast
          - Green is for HIGHLIGHTS only: small accent blobs that catch the eye, strategic pops behind key focal points, minimal environmental accents
          - Keep green shapes: small to medium size only (not large blobs), irregular organic shapes, slightly offset from black linework (imperfect registration feel)
          - GREEN RESTRAINT: Less is more - the illustration should read as black + halftone texture with just a few strategic green pops
          - GREEN DOES NOT: Fill large areas, appear everywhere, become the dominant color element

VISUAL MATURITY:
Editorial cartoon sophistication for adult readers - the artistic confidence and visual intelligence of a master newspaper cartoonist. Hand-drawn artistry with purpose and skill, not playful whimsy. Think Op-Ed illustration, political cartooning for grown-ups, visual journalism with personality and craft. Professional editorial cartoon quality referencing masters of the form. Avoid: childish proportions, juvenile styling, cute rounded aesthetics meant for kids, animation character design, generic vector graphics, sterile digital output.

TONE GUIDANCE:
${storyTone.toUpperCase()} - ${expressionInstruction}

DIVERSITY PRINCIPLES:
- Ensure representation reflects contemporary diverse society naturally within the scene context
- Avoid defaulting to homogeneous demographics; include varied ages, ethnicities, and styles when depicting people

          Line work: DRAMATIC line weight variation is the key to personality - maintain economy of ELEMENTS but EXPLOSIVE variety in LINE WEIGHT. Some lines THICK and confident (foreground figures), others THIN and delicate (background, fine details). Sharp observational drawing quality (not rounded children's comic style). Think Op-Ed illustration masters: confident pen control with NATURAL HAND ENERGY, adult facial structure, journalistic sophistication. NO decorative strokes. NO texture. NO shading lines inside shapes.
          
          LINE WEIGHT DYNAMICS (create depth and personality through stroke contrast):
          ❌ STERILE: All lines same weight → computer-generated uniformity → lifeless
          ✅ PERSONALITY: Foreground figures THICK bold strokes (3-4x baseline) → Middle ground MEDIUM strokes (1.5-2x) → Background THIN strokes (0.5-1x) → Delicate facial features THIN elegant lines (0.3-0.5x) → FEELS HAND-DRAWN BY A MASTER
          
          HUMAN HAND QUALITIES (inject organic energy):
          • Slight line wobble in long strokes (not mechanical ruler-straight)
          • Natural taper at stroke ends (confident pen lift)
          • Lines that "breathe" - not robotic consistency
          • Vary pressure: heavy confident strokes vs. light delicate touches
          • Natural hand tremor in detail work (adds authenticity)

CHARACTER PORTRAYAL (when depicting people):
Sharp, observational drawing of mature adults - NOT rounded children's comic faces. Think David Levine caricature intelligence, editorial cartoon sophistication, visual journalism. Adults depicted with realistic proportions, angular facial structure where appropriate, mature body language. Avoid: rounded "friendly" faces from adventure comics, simplified children's book character design, cute proportions. Serious facial structure appropriate for news illustration - avoid caricature unless specifically editorial/satirical. Natural diversity in posture, gesture, and response while maintaining visual sophistication. Show varied reactions, but maintain professional illustration quality. Reference: contemporary editorial illustration for serious journalism (NYT Opinion section, The Guardian Long Reads, Financial Times visual style).

ANATOMICAL CORRECTNESS:
When figures are partially visible in frame, ensure all visible body parts follow natural physics:
- If legs/feet are visible, they must be properly grounded on surfaces
- Limbs must not appear to merge with or sink into ground/floors/surfaces
- Body parts must have clear boundaries from environment
- Partial figures should be cropped at natural boundaries (shoulders, waist, mid-thigh) not at joints

If showing a person from waist-up, knees-up, or any cropped view: this is perfectly fine for composition. But if their feet/legs ARE visible in the frame, they must be drawn with correct spatial relationship to the ground.

EXPLICIT STYLE EXCLUSIONS:
DO NOT create: children's book art, whimsical styling meant for kids, rounded "cute" aesthetics, exaggerated childish proportions, juvenile visual language, simplified shapes for children, friendly rounded characters meant for toddlers, children's adventure comic style (Tintin, Asterix), rounded friendly faces from kids' comics, simplified character designs meant for young readers, animation-style rendering, comic book superhero styling, generic sterile vector graphics, algorithmic digital output lacking artistic personality, excessive crosshatching, decorative stippling, over-rendered textures, complex pen-and-ink rendering techniques, heavily shaded illustrations, intricate hatching patterns that obscure clarity.

INSTEAD: Create sharp, observational editorial cartoon illustration for sophisticated adult readers. Reference visual Op-Ed masters (David Levine NYT caricatures, Ben Shahn social realism, Edel Rodriguez political posters) - outline-driven clarity with adult intelligence and journalistic sophistication. Clean lines that capture character and situation with economy, not cute adventure comic simplicity. Think visual Op-Ed by a skilled editorial cartoonist - New Yorker illustration, political cartoon masters, visual journalism with craft and personality. Hand-drawn artistry, not vector graphics. Editorial cartoon sophistication, not entertainment for children. Create clean, outline-driven editorial cartoons with bold contours and minimal rendering. Shadows = solid black shapes. Details = only what's essential to story. Think "confident outline + strategic solid blacks" NOT "skillful hatching demonstration."

CRITICAL: The illustration must be immediately recognizable as being about THIS specific story's subject matter. Prioritize subject-specific visual elements over generic scene-setting.

Avoid: Dated aesthetics, retro styling (unless story-specific), generic "people in front of building" compositions, excessive rendering with decorative hatching, limbs merging with surfaces, legs sinking into ground, feet disappearing into floors, anatomically impossible spatial relationships between figures and environment, body parts fading into backgrounds.

TWO-COLOR COMPOSITION EXAMPLES:
          ✅ CORRECT: Black line drawing of figure → VISIBLE halftone dot texture in shadow areas under chin, in clothing folds → 1 small green accent blob behind shoulder → 1 tiny green highlight on background element → Result: black linework + textured shadows + minimal green pops
          ✅ CORRECT: Black line art of scene → Dense halftone dots in ALL shadow areas (clearly visible dot pattern) → 2 small green accent shapes strategically placed → White highlights → Halftone texture is CLEARLY VISIBLE as dot pattern
          ❌ WRONG: Green covering 30%+ of the image (use 10-15% maximum)
          ❌ WRONG: No visible halftone texture in shadows (halftone MUST be apparent)
          ❌ WRONG: Green gradients or green filling outlined areas precisely
          ❌ WRONG: More than 3-4 green accents (should be minimal, strategic highlights only)

          FINAL REMINDER: This is a TWO-COLOR PRINT ILLUSTRATION with DRAMATIC LINE WEIGHT VARIATION. TWO COLORS ONLY: Black (#000000) with MANDATORY VISIBLE fine halftone texture in shadows/mid-tones + Minimal bright mint green (#58FFBC) as sparse highlight accents (1-3 small areas only, 10-15% coverage maximum). No other colors. No gradients. THICK bold strokes for foreground figures → THIN delicate lines for background details. Bold black outlines with NATURAL HAND ENERGY (slight wobble, organic taper, breathing lines - not robotic uniformity). Solid black shadows with VISIBLE fine halftone grain texture in mid-tones and shadow areas - the halftone dots MUST be apparent. Zero hatching. Zero crosshatching. Zero stippling beyond halftone dots. Human hand energy, not computer-generated uniformity. Think: "What would David Levine or Ronald Searle draw as a two-color risograph poster with VARIED-WEIGHT black ink strokes, VISIBLE fine halftone texture emphasizing shadows, and minimal strategic green highlight pops - confident, expressive, ALIVE with artistic personality?" If you add decorative pen detail inside outlined shapes, you have failed the assignment.`;

    // Generate image based on selected model
    const startTime = Date.now()
    let imageBase64: string
    let generationTime: number

    if (modelConfig.provider === 'replicate-flux') {
      // FLUX.1-dev via Replicate - Standard quality tier
      console.log('Generating with FLUX.1-dev via Replicate...');
      console.log('🎨 Using FLUX-specific simplified prompt strategy');
      
      // FLUX-specific prompt with quantified constraints and explicit bans
      const fluxPrompt = `MANDATORY STYLE RULES (FLUX MUST FOLLOW):
1. COLORS: Black (#000000) + Mint Green (#58FFBC) ONLY - no orange, no gray fills, no other colors
2. GREEN LIMIT: Apply mint green to EXACTLY 2-3 small objects maximum (one window, one door, one sign) - NOT on multiple storefronts
3. LINE WORK: Thick outer contours ONLY - NO window panes, NO brick texture, NO roof tiles, NO interior architectural detail
4. SHADOWS: Solid black fills ONLY - NO crosshatching, NO halftone dots, NO texture patterns
5. ROADS: Solid white ONLY - NO perspective lines, NO road markings, NO surface texture
6. COMPOSITION: Edge-to-edge with white background - NO text anywhere

SUBJECT: ${subjectMatter}

STORY: "${story.title}"

VISUAL EXECUTION CHECKLIST:
✓ Bold black outlines (2-4px weight) defining building shapes
✓ Solid black shadows under eaves and doorways
✓ 2-3 small mint green accent elements (e.g. one awning, one door, one window box)
✓ Simplified building facades - NO individual bricks, NO window frames, NO decorative molding
✓ Clean white road surface with NO markings
✓ Maximum 20-30 total line strokes for entire composition

TONE: ${storyTone.toUpperCase()} - ${expressionInstruction}

WHAT TO AVOID (CRITICAL):
❌ Multiple green storefronts (causes visual chaos)
❌ Window pane dividers and glass reflections
❌ Brick/tile texture patterns
❌ Perspective construction lines on roads
❌ Interior architectural details (molding, frames, panels)
❌ Any color other than black and mint green (#58FFBC)

Style benchmark: Think flat vector illustration with maximum 30 line strokes total.`;
      
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY not configured');
      }

      // Start generation with FLUX.1-dev (Replicate models endpoint)
      const createResponse = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60'
        },
        body: JSON.stringify({
          input: {
            prompt: fluxPrompt,
            aspect_ratio: '3:2',
            num_outputs: 1,
            num_inference_steps: 28,
            output_format: 'png',
            output_quality: 90,
            go_fast: true
          }
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Replicate creation error:', errorText);
        throw new Error(`Replicate API error: ${createResponse.status}`);
      }

      const prediction = await createResponse.json();
      const predictionId = prediction.id;
      console.log('Replicate prediction started:', predictionId);

      // Poll for completion (max 90 seconds for quality generation)
      let attempts = 0;
      const maxAttempts = 90;
      let finalPrediction;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Token ${REPLICATE_API_KEY}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Replicate status check failed: ${statusResponse.status}`);
        }

        finalPrediction = await statusResponse.json();
        console.log(`Replicate status (attempt ${attempts + 1}):`, finalPrediction.status);

        if (finalPrediction.status === 'succeeded') {
          break;
        } else if (finalPrediction.status === 'failed' || finalPrediction.status === 'canceled') {
          throw new Error(`Replicate generation failed: ${finalPrediction.error || 'Unknown error'}`);
        }

        attempts++;
      }

      if (!finalPrediction || finalPrediction.status !== 'succeeded') {
        throw new Error('Replicate generation timeout - please try again');
      }

      // Get image URL from output
      const imageUrl = finalPrediction.output?.[0];
      if (!imageUrl) {
        throw new Error('No image URL in Replicate response');
      }

      console.log('Fetching generated image from:', imageUrl);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
      }

      const imageBlob = await imageResponse.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      imageBase64 = safeBase64Encode(uint8Array);

    } else if (modelConfig.provider === 'lovable-gemini') {
      // Use Lovable AI Gateway for Gemini image generation - Budget tier
      console.log('Generating with Gemini 2.5 Flash Image via Lovable AI Gateway...');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      // Create structured Gemini prompt with critical rules first
      const geminiPrompt = `🔴 ADULT AUDIENCE ONLY - PROFESSIONAL EDITORIAL ILLUSTRATION FOR NEWS PUBLICATION 🔴

This illustration will be published in a serious news outlet read by adults (similar to The Guardian, Financial Times, New Yorker, BBC News, Washington Post). Your output will be judged by professional editors.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE REQUIREMENTS (FAILURE = REJECTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADULT EDITORIAL STYLE ONLY - NO CARTOON, NO CHILDREN'S BOOK, NO PLAYFUL
   ❌ REJECT: Rounded cute faces, big eyes, simplified children's book style
   ✅ REQUIRE: Sophisticated editorial illustration with mature visual language
   
2. ABSOLUTELY NO TEXT - Zero tolerance for any written language
   ❌ Speech bubbles, thought bubbles, signs with words, labels, captions
   ✅ Pure visual storytelling only

3. MINT GREEN ACCENT RULE - STRICT PLACEMENT
   ✅ ONLY: 2-3 small (#58FFBC) spots on BACKGROUND objects (signs, equipment, windows, furniture)
   ❌ NEVER: On people's clothing, skin, hair, or bodies
   ⚠️  PENALTY: Green on people = instant rejection and wasted generation

4. EDGE-TO-EDGE COMPOSITION - No amateur framing
   ❌ White borders, padding, margins around image
   ✅ Subject extends to all four edges of canvas

5. PROFESSIONAL LINE WORK - NOT comic book style
   ✅ Varying line weights (thick and thin), sophisticated editorial pen work
   ❌ Uniform lines, decorative crosshatching, dense shading patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL STYLE MANDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TARGET AESTHETIC: Editorial illustration for serious journalism (NOT entertainment, NOT children's content)

DRAWING TECHNIQUE:
• Bold black ink outline with sophisticated line weight variation
• Solid black fills for deepest shadows (strategic placement)
• MINIMAL texture: If needed, use sparse fine dots (10-20 dots max per area)
• Clean negative space with confident white areas
• Adult faces with mature proportions and expressions

COLOR PALETTE:
• Predominantly black line work on white
• EXACTLY 2-3 small mint green (#58FFBC) accent shapes
• Green placement: Background elements ONLY (never on humans)
• Think: Street signs, equipment panels, window frames, architectural details

FORBIDDEN STYLES (These will cause rejection):
❌ Cartoon/animated character style
❌ Children's book illustration aesthetic
❌ Comic strip/manga style
❌ Playful/whimsical character design
❌ Oversimplified cute faces
❌ Heavy decorative patterns
❌ Photorealism attempts

REQUIRED AESTHETIC:
✅ Guardian/New Yorker editorial illustration
✅ Sophisticated pen and ink editorial work
✅ Adult news publication visual language
✅ Professional poster design aesthetic
✅ Mature visual storytelling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STORY: "${story.title}"
EDITORIAL TONE: ${storyTone.toUpperCase()}
EXPRESSION: ${expressionInstruction}

SUBJECT TO ILLUSTRATE:
${subjectMatter}

COMPOSITION REQUIREMENTS:
• Edge-to-edge illustration (no white borders/padding)
• Strong focal point with clear visual hierarchy
• Sophisticated use of negative space
• Professional editorial framing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE REFERENCES FOR YOUR INTERNAL GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Think: The Guardian editorial illustrations, Financial Times weekend illustrations, New Yorker spot illustrations, BBC News graphics, Washington Post opinion page illustrations.

NOT: Disney, Pixar, children's books, comic strips, manga, animation style.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL QUALITY CHECK BEFORE GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before you generate, confirm:
✅ This looks like it belongs in The Guardian, not a children's book
✅ Zero text/words anywhere in the image
✅ Mint green ONLY on background objects (NOT on people)
✅ Edge-to-edge composition (no white borders)
✅ Sophisticated adult editorial aesthetic
✅ Professional line work with varying weights

⚠️  CRITICAL REMINDER: Any cartoon/childish style = wasted generation and unhappy editors
⚠️  GREEN ON PEOPLE = Instant rejection and credit waste`;

      const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [
            {
              role: 'user',
              content: geminiPrompt
            }
          ],
          modalities: ['image', 'text'],
          response_modalities: ['IMAGE'],
          image_config: {
            aspect_ratio: '3:2'
          }
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('Gemini API error response:', errorText);
        
        if (geminiResponse.status === 429) {
          throw new Error('Gemini rate limit exceeded. Please try again later.');
        } else if (geminiResponse.status === 402) {
          throw new Error('Lovable AI credits exhausted. Please add credits to your workspace.');
        }
        
        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      }

      const geminiData = await geminiResponse.json();
      console.log('📊 Gemini generation metadata:', {
        model: 'google/gemini-2.5-flash-image',
        requestedAspectRatio: '3:2',
        promptLength: geminiPrompt.length,
        estimatedCost: '$0.005',
        creditsUsed: 1
      });
      console.log('Gemini response structure:', JSON.stringify(geminiData, null, 2).substring(0, 1000));

      // Extract image from response with comprehensive error handling
      let base64Data: string | undefined;
      
      console.log('Parsing Gemini response. Available keys:', Object.keys(geminiData));
      
      // Try different response formats (Gemini API changes frequently)
      if (geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        console.log('Found image in choices[0].message.images[0].image_url.url');
        base64Data = geminiData.choices[0].message.images[0].image_url.url;
      } else if (geminiData.choices?.[0]?.message?.content) {
        console.log('Checking choices[0].message.content for base64');
        const content = geminiData.choices[0].message.content;
        if (typeof content === 'string' && content.includes('base64,')) {
          base64Data = content;
        } else if (Array.isArray(content)) {
          // Check if content is an array with image parts
          for (const part of content) {
            if (part?.type === 'image_url' && part?.image_url?.url) {
              base64Data = part.image_url.url;
              break;
            } else if (part?.image_base64) {
              base64Data = `data:image/png;base64,${part.image_base64}`;
              break;
            }
          }
        }
      } else if (geminiData.data?.[0]?.url) {
        console.log('Found image in data[0].url');
        base64Data = geminiData.data[0].url;
      } else if (geminiData.data?.[0]?.b64_json) {
        console.log('Found image in data[0].b64_json');
        base64Data = `data:image/png;base64,${geminiData.data[0].b64_json}`;
      } else if (geminiData.images?.[0]) {
        console.log('Found image in images[0]');
        base64Data = geminiData.images[0];
      }

      if (!base64Data) {
        console.error('Could not find image in Gemini response. Full response:', JSON.stringify(geminiData, null, 2));
        throw new Error('No image data in Gemini response. The API response format may have changed.');
      }

      console.log('Found base64 data, length:', base64Data.length, 'prefix:', base64Data.substring(0, 50));
      
      // Remove data URL prefix if present
      const base64String = base64Data.includes('base64,') 
        ? base64Data.split('base64,')[1] 
        : base64Data;

      console.log('Decoding base64 string of length:', base64String.length);

      // Decode base64 to direct base64 string
      try {
        // Validate base64 before assigning
        atob(base64String); // Test decode
        imageBase64 = base64String;
        console.log('Successfully validated image base64');
      } catch (decodeError) {
        console.error('Failed to decode base64:', decodeError);
        throw new Error('Failed to decode Gemini image data');
      }
    } else if (modelConfig.provider === 'openai') {
      // OpenAI GPT-Image-1 - Premium quality tier
      console.log('Generating with OpenAI GPT-Image-1...');
      
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: illustrationPrompt,
          n: 1,
          size: '768x768', // Optimized for cost
          quality: 'low', // 60-70% cost reduction
          output_format: 'webp', // Smaller file size
          output_compression: 80
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error:', errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData = await openaiResponse.json();
      console.log('OpenAI response received');

      // GPT-Image-1 returns base64 by default
      const base64Data = openaiData.data?.[0]?.b64_json;
      if (!base64Data) {
        throw new Error('No image data in OpenAI response');
      }

      imageBase64 = base64Data;

    } else {
      throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }

    generationTime = Date.now() - startTime
    
    // Calculate actual cost based on model and settings
    let estimatedCost = modelConfig.cost;
    if (modelConfig.provider === 'openai') {
      // Updated costs for 768x768 low quality: ~$0.02 per image
      estimatedCost = 0.02;
    }

    // Track API usage and cost for analytics (skip if user lacks permission)
    try {
      const { error: usageError } = await supabase
        .from('api_usage')
        .insert({
          service_name: modelConfig.provider,
          operation: 'image_generation',
          cost_usd: estimatedCost,
          tokens_used: 0, // Not applicable for image generation
          region: null // Could be enhanced to track user region
        })

      if (usageError) {
        console.error('Failed to log API usage (this is non-critical):', usageError)
        // Don't fail the request if usage logging fails
      }
    } catch (error) {
      console.error('API usage logging failed (this is non-critical):', error)
      // Continue with the request even if logging fails
    }

    // Upload to Supabase Storage
    const fileName = `story-${storyId}-${Date.now()}.png`
    
    // Validate base64 data before processing
    if (!imageBase64) {
      throw new Error('No image data to upload')
    }
    
    try {
      // Convert base64 to Uint8Array with error handling
      const binaryString = atob(imageBase64)
      const uint8Array = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i)
      }
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('visuals')
        .upload(fileName, uint8Array, {
          contentType: 'image/png',
          upsert: false
        })
      
      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`)
      }
    } catch (decodeError) {
      console.error('Base64 decode error:', decodeError)
      throw new Error(`Failed to process image data: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`)
    }

    const imageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/visuals/${fileName}`

    // Update story with illustration (clearing any existing animation)
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        cover_illustration_url: imageUrl,
        cover_illustration_prompt: illustrationPrompt,
        illustration_generated_at: new Date().toISOString(),
        animated_illustration_url: null  // Clear animation when new static image is generated
      })
      .eq('id', storyId)

    if (updateError) {
      throw new Error(`Update error: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        illustration_url: imageUrl,
        model: model,
        credits_used: isSuperAdmin ? 0 : modelConfig.credits,
        new_balance: creditResult?.new_balance || null
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Story illustrator error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})