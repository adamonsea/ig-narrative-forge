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
      // User provided custom instructions - enhance if too vague
      const userPrompt = customPrompt.trim();
      console.log('👤 User-provided prompt:', userPrompt);
      
      // Detect "abstract" prompts that tend to produce minimal motion in Wan 2.2 i2v.
      // EXPANDED verb list - only enhance if NO motion verbs present (respects user intent)
      const visibleVerbMatches = userPrompt.match(
        /\b(sway|wave|flutter|nod|turn|gesture|blink|ripple|spin|shake|bounce|float|drift|flow|rock|wiggle|breathe|pulse|flicker|shimmer|walk|run|march|point|clap|cheer|raise|lower|scroll|look|gaze|stare|move|shift|lean|sit|stand|jump|dance|twist|stretch|reach|grab|hold|drop|throw|catch|push|pull|swing|tilt|rotate|fly|fall|rise|climb|open|close|write|read|type|tap|swipe|blow|crash|splash|drip|pour|spray|scatter|gather|spread|shrink|grow|expand|vibrate|tremble|quiver|shudder|slide|glide|roll|tumble|hop|skip|stride|stroll|hurry|rush|dash|crawl|creep|sneak|prowl|pounce|lunge|strike|hit|kick|punch|slap|knock|pound|hammer|drill|saw|cut|chop|stir|mix|whisk|blend|knead|press|squeeze|crush|grind|peel|scrub|wipe|dust|polish|sweep|brush|comb|speaks|talking|speaking|nodding|waving|moving|turning|walking|running|gesturing|pointing|looking|standing|sitting|leaning)\b/gi
      );
      const visibleVerbCount = visibleVerbMatches?.length ?? 0;

      // Only enhance if NO motion verbs (much more permissive - respects user intent)
      const shouldEnhance = visibleVerbCount < 1;

      if (shouldEnhance) {
        console.log(`⚠️ Prompt has no motion verbs, enhancing with AI...`);
        animationPrompt = await enhanceVaguePrompt(userPrompt, story.title, story.cover_illustration_prompt || '');
      } else {
        console.log(`✅ User prompt has ${visibleVerbCount} motion verb(s), using directly`);
        animationPrompt = `${userPrompt}, static camera`;
      }
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
    console.log(`🎬 Final animation prompt: ${animationPrompt}`);

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

    // Update story record with animation and lifecycle tracking
    const { error: updateError } = await supabase
      .from('stories')
      .update({
        animated_illustration_url: publicUrl,
        animation_generated_at: new Date().toISOString(),
        is_auto_animated: false, // Manual animations - set to true only from automation
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
 * Enhances a vague user prompt with specific motion details
 */
async function enhanceVaguePrompt(
  vaguePrompt: string,
  storyTitle: string,
  imagePrompt: string
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    // Fallback: add clearly visible motion (avoid "subtle" which can suppress results)
    return `${vaguePrompt}, people turn heads and gesture clearly, fabric and debris flutter noticeably, static camera`;
  }
  
  try {
    console.log('🔧 Enhancing vague prompt with AI...');
    
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
          content: `The user wants to animate an image with this instruction: "${vaguePrompt}"

This is too vague for the video model. Expand it into a SPECIFIC motion description (max 22 words) with CLEAR, VISIBLE movement.

CONTEXT:
- Story: ${storyTitle}
- Image shows: ${imagePrompt.substring(0, 200)}

Requirements:
1) Include at least TWO moving elements (e.g., person + environment, or two people)
2) Use concrete body parts/actions (head turns, hands point, shoulders shrug, eyes blink)
3) Make the motion noticeable (avoid "subtle", "slight", "gentle")
4) Keep camera static (no zoom/pan)

Add SPECIFIC body movements or environmental motion:
- For people: describe what body parts move (head turns, arms gesture, eyes blink)
- For scenes: describe what elements move (leaves rustle, flags wave, water ripples)

Example transformations:
- "Police investigate" → "Police officer turns head, gestures toward damage, partner nods and writes notes"
- "Crowd scene" → "People in crowd sway and shift weight, nearest figures gesture animatedly"
- "Building exterior" → "Flags on building flutter, tree branches sway, pedestrian walks past"

Return ONLY the enhanced motion prompt.`
        }],
        max_tokens: 80,
        temperature: 0.5
      })
    });
    
    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    let enhanced = data.choices[0].message.content.trim();
    enhanced = enhanced.replace(/^["']|["']$/g, '');
    
    console.log(`✨ Enhanced prompt: ${enhanced}`);
    return `Static camera, ${enhanced}`;
    
  } catch (error) {
    console.error('⚠️ Enhancement failed:', error);
    return `${vaguePrompt}, people turn heads and gesture clearly, fabric and debris flutter noticeably, static camera`;
  }
}

/**
 * Generates AI-driven animation prompt based on story content
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
    console.log('🧠 Generating AI animation prompt with full image context...');
    
    // USE THE FULL IMAGE PROMPT for context instead of generic extraction
    const imageContext = originalImagePrompt 
      ? originalImagePrompt.substring(0, 400) // Use actual image description
      : title; // Fallback to title only if no image prompt
    
    console.log(`🎯 Image context: ${imageContext.substring(0, 100)}...`);
    
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
          content: `Generate a SHORT animation prompt (max 18 words) for an image-to-video model.

IMAGE SHOWS: ${imageContext}
STORY HEADLINE: ${title}

Create a motion description that:
1. References specific elements FROM THE IMAGE (not generic "person" or "figure")
2. Uses concrete physical actions: turns, gestures, waves, nods, shifts, sways
3. Has at least 2 moving elements
4. Avoids vague words: subtle, gentle, slight, nearly imperceptible

Examples of GOOD prompts:
- "Council member turns to camera and gestures, papers flutter on desk"
- "Cyclist pedals steadily, wheels spin, jacket flaps in wind"
- "Chef stirs pot vigorously, steam rises, assistant chops vegetables"

Examples of BAD prompts:
- "Scene comes to life with movement" (too vague)
- "Subtle atmospheric motion" (too passive)
- "Person moves naturally" (too generic)

Return ONLY the motion prompt, no quotes or explanation.`
        }],
        max_tokens: 60,
        temperature: 0.5 // Lower temperature for more consistent results
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
    
    // Prepend static camera for better model compliance
    const finalPrompt = `Static camera, ${prompt}`;
    
    console.log('✨ Context-aware animation prompt:', finalPrompt);
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
    return 'Static camera, heavy machinery operates, workers gesture, pedestrians observe';
  }
  
  // Protest/demonstration stories
  if (titleLower.match(/protest|demonstrat|march|rally|campaign/i)) {
    return 'Static camera, crowd sways and gestures, signs move, people march forward';
  }
  
  // Business/retail stories
  if (titleLower.match(/shop|business|retail|store|trade|customer/i)) {
    return 'Static camera, shopkeeper gestures, customers browse, door opens';
  }
  
  // Council/meeting stories
  if (titleLower.match(/council|meeting|debate|hearing|committee/i)) {
    return 'Static camera, officials gesture in discussion, papers shuffle, attendees nod';
  }
  
  // Crime/police stories
  if (titleLower.match(/crime|police|arrest|theft|burglary|investigation/i)) {
    return 'Static camera, police officers move purposefully, witnesses gesture and point';
  }
  
  // Education/school stories
  if (titleLower.match(/school|education|student|teacher|university|pupil/i)) {
    return 'Static camera, students interact and gesture, teachers demonstrate';
  }
  
  // Sports/recreation stories
  if (titleLower.match(/sport|football|cricket|match|play|recreation|team/i)) {
    return 'Static camera, athletes move dynamically, spectators cheer and gesture';
  }
  
  // Health/hospital stories
  if (titleLower.match(/hospital|health|medical|doctor|nhs|patient/i)) {
    return 'Static camera, medical staff move with purpose, patients interact';
  }
  
  // Weather/environment stories
  if (titleLower.match(/weather|storm|flood|wind|rain|climate|snow/i)) {
    return 'Static camera, natural elements move powerfully, people react to conditions';
  }
  
  // Transport/traffic stories
  if (titleLower.match(/traffic|transport|road|train|bus|railway/i)) {
    return 'Static camera, vehicles move along routes, commuters wait and board';
  }
  
  // Fire/emergency stories
  if (titleLower.match(/fire|blaze|emergency|rescue|firefighter/i)) {
    return 'Static camera, emergency responders act swiftly, flames flicker, smoke rises';
  }
  
  // Fallback to tone-based movement
  return getCameraMovementPrompt(tone);
}

/**
 * Generates camera movement prompt based on story tone (fallback)
 */
function getCameraMovementPrompt(tone: string): string {
  const prompts: Record<string, string> = {
    'urgent': 'Static camera, dynamic energy, sense of motion and importance',
    'celebratory': 'Static camera, people wave and cheer, festive movement',
    'somber': 'Static camera, slow contemplative motion, minimal movement',
    'hopeful': 'Static camera, soft forward motion, gentle inspiration',
    'informative': 'Static camera, steady movement, professional atmosphere',
    'conversational': 'Static camera, natural movement, people interact',
    'neutral': 'Static camera, gentle atmospheric movement, people shift weight'
  };
  return prompts[tone] || prompts['neutral'];
}
