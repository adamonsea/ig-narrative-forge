import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIXED_DURATION = 5; // Alibaba Wan 2.2 i2v outputs ~5 seconds

// Animation quality tiers
type AnimationQuality = 'standard' | 'fast';

interface QualityConfig {
  modelVersion: string;
  resolution: string;
  creditCost: number;
  estimatedApiCost: string;
}

const QUALITY_CONFIGS: Record<AnimationQuality, QualityConfig> = {
  standard: {
    // Alibaba Wan 2.2 i2v - 720p, higher quality
    modelVersion: '9c49fe41d6b2a0e62199dc96bee4a9dd3565a4c563f9b80998358f14322c34f6',
    resolution: '720p',
    creditCost: 2,
    estimatedApiCost: '$1.00',
  },
  fast: {
    // Wan 2.2 i2v Fast - 480p, optimized for speed and cost
    modelVersion: 'febae7d9656309cf8c5df4842b27ae4768c0e47a0e1ce443a5ae81f896956134',
    resolution: '480p',
    creditCost: 1,
    estimatedApiCost: '$0.05',
  },
};

// 🔄 FEATURE FLAG: Toggle AI-driven vs keyword-based animation prompts
// Set to false to rollback to Phase 1 keyword matching
const USE_AI_PROMPTS = true;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎬 Animate illustration request started');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const replicateApiKey = Deno.env.get('REPLICATE_API_KEY');

    if (!replicateApiKey) {
      throw new Error('REPLICATE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const { storyId, staticImageUrl, quality = 'standard', customPrompt } = await req.json();

    if (!storyId || !staticImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing storyId or staticImageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate quality tier
    const qualityConfig = QUALITY_CONFIGS[quality as AnimationQuality];
    if (!qualityConfig) {
      return new Response(
        JSON.stringify({ error: 'Invalid quality tier. Use "standard" or "fast"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📖 Story ID: ${storyId}, Quality: ${quality} (${qualityConfig.resolution}), Image: ${staticImageUrl}`);

    // Get user from request
    const authHeader = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is superadmin (bypass credit check)
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isSuperAdmin = userRole?.role === 'superadmin';

    // Deduct credits if not superadmin
    if (!isSuperAdmin) {
      const { data: creditResult, error: creditError } = await supabase.rpc('deduct_user_credits', {
        p_user_id: user.id,
        p_amount: qualityConfig.creditCost,
        p_description: `Animate story illustration (Wan 2.2 i2v ${qualityConfig.resolution})`,
        p_story_id: storyId
      });

      if (creditError) {
        console.error('❌ Credit deduction error:', creditError);
        return new Response(
          JSON.stringify({ error: 'Failed to deduct credits', details: creditError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Credits deducted:', qualityConfig.creditCost);
    }

    // Fetch story to get title and tone for content-aware motion prompt
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('tone, title, cover_illustration_prompt')
      .eq('id', storyId)
      .single();

    if (storyError) {
      console.error('❌ Story fetch error:', storyError);
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch first 3 slides for AI context (if using AI prompts)
    let slideText = '';
    if (USE_AI_PROMPTS) {
      const { data: slides } = await supabase
        .from('slides')
        .select('content, slide_number')
        .eq('story_id', storyId)
        .order('slide_number', { ascending: true })
        .limit(3);
      
      slideText = slides?.map(s => s.content).join(' ') || '';
      console.log(`📝 Slide content fetched: ${slideText.substring(0, 100)}...`);
    }

    // Generate animation prompt (user-provided takes priority, then AI-driven, then keyword fallback)
    let animationPrompt: string;
    if (customPrompt && customPrompt.trim()) {
      // User provided custom instructions - use directly with minimal constraints
      console.log('👤 Using user-provided custom prompt (priority mode)');
      animationPrompt = `${customPrompt.trim()}, static camera`;
    } else if (USE_AI_PROMPTS) {
      console.log('🤖 Using AI prompt generation (Phase 4 - expressive)');
      animationPrompt = await generateAnimationPromptWithAI(
        story.title,
        slideText,
        story.tone || 'neutral',
        story.cover_illustration_prompt || undefined
      );
    } else {
      console.log('🔤 Using keyword-based prompt generation (fallback)');
      animationPrompt = getContentAwareAnimationPrompt(story.title, story.tone || 'neutral');
    }
    console.log(`🎬 Animation prompt: ${animationPrompt}`);

    // Call Replicate API with selected quality tier
    console.log(`🚀 Calling Replicate API (${quality} tier: ${qualityConfig.resolution})...`);
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateApiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        version: qualityConfig.modelVersion,
        input: {
          image: staticImageUrl,
          prompt: animationPrompt,
          video_length: 5,
          resolution: qualityConfig.resolution,
          seed: Math.floor(Math.random() * 1000000)
        }
      })
    });

    if (!replicateResponse.ok) {
      const errorText = await replicateResponse.text();
      console.error('❌ Replicate API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Replicate API request failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const predictionData = await replicateResponse.json();
    const predictionId = predictionData.id;
    console.log(`⏳ Prediction created: ${predictionId}, polling for completion...`);

    // Poll for prediction completion (max 90 seconds)
    let videoUrl: string | null = null;
    const maxAttempts = 18; // 90 seconds (5-second intervals)
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${replicateApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!statusResponse.ok) {
        console.error('❌ Status check failed');
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 Prediction status: ${statusData.status} (attempt ${attempt + 1}/${maxAttempts})`);

      if (statusData.status === 'succeeded') {
        videoUrl = statusData.output;
        break;
      } else if (statusData.status === 'failed') {
        throw new Error('Replicate prediction failed: ' + (statusData.error || 'Unknown error'));
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timed out after 90 seconds');
    }

    console.log('✅ Video generated:', videoUrl);

    // Download video from Replicate
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error('Failed to download video from Replicate');
    }

    const videoBlob = await videoResponse.arrayBuffer();
    const videoBuffer = new Uint8Array(videoBlob);

    // Upload to Supabase Storage
    const filename = `${storyId}-animated-${Date.now()}.mp4`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('story-illustrations')
      .upload(`animated/${filename}`, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      throw new Error('Failed to upload video: ' + uploadError.message);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('story-illustrations')
      .getPublicUrl(`animated/${filename}`);

    console.log('📤 Uploaded to:', publicUrl);

    // Update story record
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        animated_illustration_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', storyId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      throw new Error('Failed to update story: ' + updateError.message);
    }

    // Get updated credits balance
    const { data: updatedCredits } = await supabase
      .from('user_credits')
      .select('current_balance')
      .eq('user_id', user.id)
      .single();

    console.log('✅ Animation complete!');

    return new Response(
      JSON.stringify({
        success: true,
        animated_url: publicUrl,
        duration_seconds: FIXED_DURATION,
        quality: quality,
        resolution: qualityConfig.resolution,
        credits_used: isSuperAdmin ? 0 : qualityConfig.creditCost,
        new_balance: updatedCredits?.current_balance || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Extracts the main subject from the original image prompt or story title
 */
function extractMainSubject(title: string, imagePrompt?: string): { type: string; subject: string } {
  const sourceText = (imagePrompt || title).toLowerCase();
  
  // Person/People subjects
  if (sourceText.match(/council member|councillor|official|politician/i)) {
    return { type: 'person', subject: 'council member' };
  }
  if (sourceText.match(/protester|demonstrator|activist/i)) {
    return { type: 'person', subject: 'protester' };
  }
  if (sourceText.match(/worker|builder|construction worker|tradesperson/i)) {
    return { type: 'person', subject: 'worker' };
  }
  if (sourceText.match(/shopkeeper|merchant|shop owner|retailer/i)) {
    return { type: 'person', subject: 'shopkeeper' };
  }
  if (sourceText.match(/teacher|educator|instructor/i)) {
    return { type: 'person', subject: 'teacher' };
  }
  if (sourceText.match(/doctor|nurse|medical staff|healthcare worker/i)) {
    return { type: 'person', subject: 'medical worker' };
  }
  if (sourceText.match(/police|officer|detective/i)) {
    return { type: 'person', subject: 'police officer' };
  }
  if (sourceText.match(/athlete|player|footballer|cricketer/i)) {
    return { type: 'person', subject: 'athlete' };
  }
  
  // Building/Structure subjects
  if (sourceText.match(/building|structure|council hall|town hall/i)) {
    return { type: 'building', subject: 'building' };
  }
  if (sourceText.match(/shop|store|business premises/i)) {
    return { type: 'building', subject: 'shop' };
  }
  
  // Vehicle subjects
  if (sourceText.match(/digger|excavator|bulldozer|machinery/i)) {
    return { type: 'vehicle', subject: 'construction machinery' };
  }
  if (sourceText.match(/bus|train|vehicle/i)) {
    return { type: 'vehicle', subject: 'vehicle' };
  }
  
  // Crowd/Group subjects
  if (sourceText.match(/crowd|group|gathering|assembly/i)) {
    return { type: 'crowd', subject: 'crowd' };
  }
  
  // Default to generic person
  return { type: 'person', subject: 'person' };
}

/**
 * Generates subject-specific movement templates
 */
function getSubjectMovementTemplate(subjectType: string, subject: string): string {
  const templates: Record<string, string> = {
    'person': `${subject} in frame nods slightly, minimal hand gesture, subtle weight shift`,
    'crowd': `closest figure in center of ${subject} sways gently, nearest person shifts weight`,
    'building': `visible flags on ${subject} flutter gently, window lights flicker subtly`,
    'vehicle': `${subject} shows slight idle vibration, visible exhaust movement`
  };
  
  return templates[subjectType] || templates['person'];
}

/**
 * Generates AI-driven animation prompt based on story content (Phase 3 - SIMPLIFIED)
 * 
 * Research insights from Wan 2.2 i2v model:
 * - Model works BEST with SHORT, DIRECT motion descriptions (under 20 words)
 * - Long negative prompts often get ignored or cause unpredictable behavior
 * - The model has inherent cinematic tendencies - simpler prompts = better control
 * - Focus on WHAT should move, not what shouldn't
 */
async function generateAnimationPromptWithAI(
  title: string,
  slideContent: string,
  tone: string,
  originalImagePrompt?: string
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.warn('⚠️ LOVABLE_API_KEY not set, falling back to keyword matching');
    return getContentAwareAnimationPrompt(title, tone);
  }
  
  try {
    console.log('🧠 Generating simplified AI animation prompt...');
    
    // Extract main subject from the image prompt or title
    const { type: subjectType, subject } = extractMainSubject(title, originalImagePrompt);
    
    console.log(`🎯 Extracted subject: ${subject} (type: ${subjectType})`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: `Generate a SHORT animation prompt (max 20 words) for an image-to-video model.

STORY: ${title}
MAIN SUBJECT: ${subject}

Rules:
1. Describe clear, visible movement for the main subject
2. Be SPECIFIC about the motion: "person turns head and gestures" NOT "person moves"  
3. Match energy to content - news stories can have dynamic motion, not everything needs to be subtle
4. Keep it concise - the model works better with direct prompts

Good examples:
- "Person turns head, gestures expressively while speaking"
- "Crowd waves signs, figures in foreground move and react"
- "Waves crash against shore, seabirds fly across frame"
- "Construction worker operates machinery, dust rises"
- "Cyclist pedals along path, wheels spinning"

Bad examples:
- "Dynamic scene with multiple movements" (too vague)
- "Nearly imperceptible movement" (too subtle)
- "Everything comes alive" (too abstract)

Return ONLY the motion prompt, nothing else.`
        }],
        max_tokens: 80,
        temperature: 0.8
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    let prompt = data.choices[0].message.content.trim();
    
    // Remove any quotes the model might have added
    prompt = prompt.replace(/^["']|["']$/g, '');
    
    // Only add static camera constraint - let the motion be expressive
    const finalPrompt = `${prompt}, static camera`;
    
    console.log('✨ Expressive animation prompt:', finalPrompt);
    return finalPrompt;
    
  } catch (error) {
    console.error('⚠️ AI prompt generation failed, using keyword fallback:', error);
    return getContentAwareAnimationPrompt(title, tone);
  }
}

/**
 * Generates content-aware animation prompt based on story title keywords (Phase 1 fallback)
 */
function getContentAwareAnimationPrompt(title: string, tone: string): string {
  const titleLower = title.toLowerCase();
  
  // Construction/roadworks stories
  if (titleLower.match(/roadwork|construction|building|digger|excavat|demolit/i)) {
    return 'Heavy machinery operates rhythmically, workers gesture, frustrated pedestrians observe, shopkeepers look on concerned';
  }
  
  // Protest/demonstration stories
  if (titleLower.match(/protest|demonstrat|march|rally|campaign/i)) {
    return 'Crowd sways and gestures energetically, signs move, people march forward, passionate speakers gesture';
  }
  
  // Business/retail stories
  if (titleLower.match(/shop|business|retail|store|trade|customer/i)) {
    return 'Shopkeeper gestures welcomingly, customers browse and interact, door opens, gentle bustle of commerce';
  }
  
  // Council/meeting stories
  if (titleLower.match(/council|meeting|debate|hearing|committee/i)) {
    return 'Officials gesture in discussion, papers shuffle subtly, attendees nod and react, formal deliberation';
  }
  
  // Crime/police stories
  if (titleLower.match(/crime|police|arrest|theft|burglary|investigation/i)) {
    return 'Police officers move purposefully, witnesses gesture and point, concerned residents observe, tense atmosphere';
  }
  
  // Education/school stories
  if (titleLower.match(/school|education|student|teacher|university|pupil/i)) {
    return 'Students interact and gesture, teachers demonstrate, books and materials handled, learning environment';
  }
  
  // Sports/recreation stories
  if (titleLower.match(/sport|football|cricket|match|play|recreation|team/i)) {
    return 'Athletes move dynamically, spectators cheer and gesture, equipment in motion, energetic sporting action';
  }
  
  // Health/hospital stories
  if (titleLower.match(/hospital|health|medical|doctor|nhs|patient/i)) {
    return 'Medical staff move with purpose, patients interact gently, equipment used carefully, caring atmosphere';
  }
  
  // Weather/environment stories
  if (titleLower.match(/weather|storm|flood|wind|rain|climate|snow/i)) {
    return 'Natural elements move powerfully, people react to conditions, environmental impact visible, dynamic weather';
  }
  
  // Transport/traffic stories
  if (titleLower.match(/traffic|transport|road|train|bus|railway/i)) {
    return 'Vehicles move along routes, commuters wait and board, drivers navigate, transit flows';
  }
  
  // Fire/emergency stories
  if (titleLower.match(/fire|blaze|emergency|rescue|firefighter/i)) {
    return 'Emergency responders act swiftly, flames flicker, smoke rises, urgent rescue operations';
  }
  
  // Fallback to tone-based movement
  return getCameraMovementPrompt(tone);
}

/**
 * Generates camera movement prompt based on story tone (fallback)
 */
function getCameraMovementPrompt(tone: string): string {
  const prompts: Record<string, string> = {
    'urgent': 'Dynamic energy, sense of motion and importance',
    'celebratory': 'Gentle movement, subtle rising and falling',
    'somber': 'Slow breathing-like motion, minimal movement, contemplative',
    'hopeful': 'Soft forward motion, gentle inspiration',
    'informative': 'Steady subtle movement, professional atmosphere',
    'conversational': 'Natural gentle movement, slight motion',
    'neutral': 'Subtle motion, gentle atmospheric movement'
  };
  return prompts[tone] || prompts['neutral'];
}
