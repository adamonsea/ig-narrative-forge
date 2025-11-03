import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIXED_DURATION = 5; // Alibaba Wan 2.2 i2v outputs ~5 seconds
const ANIMATION_CREDIT_COST = 2; // Replicate pricing: $0.05-0.11 per video

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
    const { storyId, staticImageUrl } = await req.json();

    if (!storyId || !staticImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing storyId or staticImageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📖 Story ID: ${storyId}, Image: ${staticImageUrl}`);

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
        p_amount: ANIMATION_CREDIT_COST,
        p_description: `Animate story illustration (Wan 2.2 i2v)`,
        p_story_id: storyId
      });

      if (creditError) {
        console.error('❌ Credit deduction error:', creditError);
        return new Response(
          JSON.stringify({ error: 'Failed to deduct credits', details: creditError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Credits deducted:', ANIMATION_CREDIT_COST);
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

    // Generate animation prompt (AI-driven or keyword-based)
    let animationPrompt: string;
    if (USE_AI_PROMPTS) {
      console.log('🤖 Using AI-driven prompt generation (Phase 2)');
      animationPrompt = await generateAnimationPromptWithAI(
        story.title,
        slideText,
        story.tone || 'neutral',
        story.cover_illustration_prompt || undefined
      );
    } else {
      console.log('🔤 Using keyword-based prompt generation (Phase 1)');
      animationPrompt = getContentAwareAnimationPrompt(story.title, story.tone || 'neutral');
    }
    console.log(`🎬 Animation prompt: ${animationPrompt}`);

    // Call Replicate API with Alibaba Wan 2.2 i2v model
    console.log('🚀 Calling Replicate API (Alibaba Wan 2.2 i2v)...');
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateApiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        version: '9c49fe41d6b2a0e62199dc96bee4a9dd3565a4c563f9b80998358f14322c34f6',
        input: {
          image: staticImageUrl,
          prompt: animationPrompt,
          video_length: 5,
          resolution: "720p",
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
        credits_used: isSuperAdmin ? 0 : ANIMATION_CREDIT_COST,
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
 * Generates AI-driven animation prompt based on story content (Phase 2 - ENHANCED)
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
    console.log('🧠 Generating AI animation prompt with enhanced style preservation...');
    
    const originalStyleHint = originalImagePrompt 
      ? `\n\nORIGINAL IMAGE GENERATION PROMPT:\n"${originalImagePrompt}"\n\nThe animation MUST preserve this exact visual style, composition, and aesthetic.`
      : '';
    
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
          content: `Create a MICRO-ANIMATION prompt for this static illustration. The animation model is Alibaba Wan 2.2 i2v (image-to-video).

STORY CONTEXT:
Title: ${title}
Content: ${slideContent}
Tone: ${tone}${originalStyleHint}

⚠️ STEP 1: IDENTIFY WHAT'S IN THE IMAGE
Based on the title and content, identify ONLY the elements that would ALREADY be visible in a static news illustration. Only these can move.

🚫 CRITICAL PROHIBITIONS (NEVER INCLUDE):
❌ NO new people, vehicles, or objects entering the frame
❌ NO elements moving into view from off-screen or edges
❌ NO camera movements (zoom, pan, tilt, dolly, tracking)
❌ NO background changes or new environmental elements
❌ NO crowd multiplication or adding figures
❌ NO scene transitions, cuts, or perspective shifts

✅ MICRO-MOVEMENT REQUIREMENTS:
• ONLY animate elements ALREADY VISIBLE in the frame
• Movements must be TINY and SUBTLE - micro-gestures only
• Maximum 1-2 primary subjects can move
• Movements must feel natural for what's shown
• Preserve EXACT composition and framing
• Maintain EXACT visual style (colors, illustration style, line work)
• Focus on FOREGROUND subjects
• Keep under 15 words
• Be hyper-specific about WHICH visible elements move

🎨 STYLE PRESERVATION:
The animation MUST maintain the flat illustration style, colors, and composition. Think of it like adding a gentle breeze to a painting - only the subjects breathe.

📝 PROMPT STRUCTURE:
Use negative prompting format:
"[describe micro-movements of existing subjects], negative prompt: camera movement, new people entering, zoom, pan, additional figures, scene change"

✅ GOOD EXAMPLES (micro-movements only):
• "Worker in frame nods slightly, visible machinery arm twitches, pedestrian shifts weight gently, negative prompt: new people, camera zoom"
• "Protesters shown sway subtly, visible signs tilt slightly, speaker's hands gesture, negative prompt: crowd entering, camera pan"
• "Council member gestures minimally, papers on desk rustle, attendee in shot nods once, negative prompt: people entering, zoom"

❌ BAD EXAMPLES (introduce new elements):
• "Protesters march into view" (new elements entering)
• "Camera slowly zooms out" (camera movement)
• "More people gather at the scene" (adding new elements)
• "Cars drive past" (unless cars are prominent in the original frame)

Return ONLY the animation prompt with negative prompts included. No explanation.`
        }],
        max_tokens: 80,
        temperature: 0.6
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const prompt = data.choices[0].message.content.trim();
    console.log('✨ AI-generated MICRO-ANIMATION prompt:', prompt);
    return prompt;
    
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
    'urgent': 'Dynamic camera movement with quick zoom and pan, energetic motion',
    'celebratory': 'Smooth rising camera movement, gentle rotation, uplifting motion',
    'somber': 'Slow gentle camera drift, minimal movement, contemplative',
    'hopeful': 'Gradual forward camera movement, soft pan, inspiring motion',
    'informative': 'Steady professional camera movement, subtle zoom',
    'conversational': 'Natural gentle camera movement, slight pan',
    'neutral': 'Subtle camera movement, slight zoom, natural motion'
  };
  return prompts[tone] || prompts['neutral'];
}
