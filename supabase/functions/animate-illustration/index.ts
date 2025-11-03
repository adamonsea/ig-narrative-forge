import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIXED_DURATION = 2; // Always 2 seconds
const ANIMATION_CREDIT_COST = 12;

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
    const runwayApiKey = Deno.env.get('RUNWAY_API_KEY');

    if (!runwayApiKey) {
      throw new Error('RUNWAY_API_KEY not configured');
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
        p_description: `Animate story illustration (2s)`,
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

    // Generate motion prompt based on story tone
    const motionPrompt = generateMotionPrompt(story.tone || 'neutral');
    console.log(`🎭 Motion prompt: ${motionPrompt}`);

    // Call Runway Gen-3 Turbo API
    console.log('🚀 Calling Runway API...');
    const runwayResponse = await fetch('https://api.dev.runwayml.com/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${runwayApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskType: 'gen3a_turbo',
        internal: false,
        options: {
          name: `story-${storyId}-animation`,
          seconds: FIXED_DURATION,
          gen3a_turbo: {
            image_uri: staticImageUrl,
            text_prompt: motionPrompt,
            seed: 42,
            watermark: false,
            resolution: '1280x768'
          }
        }
      })
    });

    if (!runwayResponse.ok) {
      const errorText = await runwayResponse.text();
      console.error('❌ Runway API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Runway API request failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const taskData = await runwayResponse.json();
    const taskId = taskData.id;
    console.log(`⏳ Task created: ${taskId}, polling for completion...`);

    // Poll for task completion (max 2 minutes)
    let videoUrl: string | null = null;
    const maxAttempts = 24; // 2 minutes (5-second intervals)
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${runwayApiKey}`
        }
      });

      if (!statusResponse.ok) {
        console.error('❌ Status check failed');
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 Task status: ${statusData.status} (attempt ${attempt + 1}/${maxAttempts})`);

      if (statusData.status === 'SUCCEEDED') {
        videoUrl = statusData.output?.[0];
        break;
      } else if (statusData.status === 'FAILED') {
        throw new Error('Runway task failed: ' + (statusData.failure || 'Unknown error'));
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timed out after 2 minutes');
    }

    console.log('✅ Video generated:', videoUrl);

    // Download video from Runway
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error('Failed to download video from Runway');
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

function generateMotionPrompt(tone: string): string {
  const motionStyles: Record<string, string> = {
    'urgent': 'Quick camera push forward, urgent energy, dramatic lighting shifts',
    'hopeful': 'Gentle upward camera drift, soft breeze effect, warm lighting glow',
    'somber': 'Slow downward pan, heavy atmosphere, subtle darkening',
    'celebratory': 'Subtle bounce and sway, festive energy, sparkling highlights',
    'informative': 'Minimal parallax effect, professional stability, slight depth',
    'conversational': 'Gentle horizontal pan, relaxed movement, natural lighting',
    'neutral': 'Minimal parallax effect, ambient movement, stable composition'
  };

  return motionStyles[tone] || motionStyles['neutral'];
}
