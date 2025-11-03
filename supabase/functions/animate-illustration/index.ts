import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIXED_DURATION = 3; // Alibaba Wan 2.2 5b outputs ~3-4 seconds
const ANIMATION_CREDIT_COST = 2; // Replicate pricing: $0.01-0.02 per video

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
        p_description: `Animate story illustration (Alibaba Wan 2.2 5b)`,
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

    // Fetch story to get tone for motion prompt
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('tone')
      .eq('id', storyId)
      .single();

    if (storyError) {
      console.error('❌ Story fetch error:', storyError);
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate motion intensity based on story tone
    const motionBucketId = getMotionIntensity(story.tone || 'neutral');
    console.log(`🎭 Motion intensity (bucket_id): ${motionBucketId}`);

    // Call Replicate API with Alibaba Wan 2.2 5b model
    console.log('🚀 Calling Replicate API (Alibaba Wan 2.2 5b)...');
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateApiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        version: 'c92ab4265c9b3b5ea9ac9a87df839ebfd662ee3a820d62c21305bf6501a73fe1',
        input: {
          image: staticImageUrl,
          motion_bucket_id: motionBucketId,
          num_frames: 25,
          fps: 8,
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

function getMotionIntensity(tone: string): number {
  // Motion bucket ID controls animation intensity (1-255)
  // Lower = subtle motion, Higher = dramatic motion
  const motionIntensities: Record<string, number> = {
    'urgent': 180,        // High motion for urgency
    'hopeful': 100,       // Moderate gentle motion
    'somber': 60,         // Subtle slow motion
    'celebratory': 150,   // Energetic motion
    'informative': 80,    // Minimal professional motion
    'conversational': 90, // Relaxed natural motion
    'neutral': 100        // Balanced default motion
  };

  return motionIntensities[tone] || motionIntensities['neutral'];
}
