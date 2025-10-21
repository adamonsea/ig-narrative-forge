import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const kieApiKey = Deno.env.get('KIE_AI_API_KEY');
    
    if (!supabaseUrl || !supabaseKey || !kieApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { slideId, prompt, model = 'mj-v6', stylePreset = 'editorial', testId } = await req.json();

    if (!slideId || !prompt) {
      throw new Error('Slide ID and prompt are required');
    }

    console.log(`Testing MidJourney API for slide ${slideId}`);

    // Get slide content for enhanced prompt
    const { data: slideData, error: slideDataError } = await supabase
      .from('slides')
      .select('content, slide_number')
      .eq('id', slideId)
      .single();

    if (slideDataError) {
      console.error('Failed to fetch slide data:', slideDataError);
    }

    const slideContent = slideData?.content || prompt;
    
    // Enhanced prompt for MidJourney with aspect ratio and quality parameters
    const enhancedPrompt = `${prompt} --ar 1:1 --v 6 --quality 1 --style raw`;

    console.log(`MidJourney enhanced prompt: ${enhancedPrompt}`);

    // Generate image using kie.ai MidJourney API
    const mjResponse = await fetch('https://api.kie.ai/api/v1/mj/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskType: 'mj_txt2img',
        prompt: enhancedPrompt,
        speed: 'relaxed',
        aspectRatio: '1:1',
        version: '7'
      }),
    });

    console.log(`MidJourney response status: ${mjResponse.status}`);

    if (!mjResponse.ok) {
      const errorData = await mjResponse.text();
      console.error('MidJourney API error:', errorData);
      throw new Error(`MidJourney generation failed: ${mjResponse.status} - ${errorData}`);
    }

    const mjData = await mjResponse.json();
    console.log('MidJourney response data:', mjData);
    
    // Check if the API call was successful
    if (mjData.code !== 200 || !mjData.data?.taskId) {
      throw new Error(`MidJourney API error: ${mjData.msg || 'Unknown error'}`);
    }

    const taskId = mjData.data.taskId;
    let imageUrl: string | null = null;
    
    // Poll for completion (max 3 minutes for MidJourney)
    let attempts = 0;
    const maxAttempts = 36; // 3 minutes at 5 second intervals
    
    while (attempts < maxAttempts && !imageUrl) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.kie.ai/api/v1/mj/record-info?taskId=${taskId}`, {
        headers: {
          'Authorization': `Bearer ${kieApiKey}`,
        },
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log(`Poll attempt ${attempts + 1}, status:`, statusData);
        
        if (statusData.code === 200 && statusData.data?.successFlag === 1) {
          // Generation completed successfully
          const resultUrls = statusData.data.resultInfoJson?.resultUrls;
          if (resultUrls && resultUrls.length > 0) {
            imageUrl = resultUrls[0].resultUrl; // Use the first generated image
            break;
          }
        } else if (statusData.data?.successFlag === 0) {
          // Still processing, continue polling
          console.log('Still processing...');
        } else if (statusData.data?.successFlag === -1) {
          // Generation failed
          throw new Error(`MidJourney generation failed`);
        }
      }
      
      attempts++;
    }
    
    if (!imageUrl) {
      throw new Error('MidJourney generation timed out after 3 minutes');
    }

    // Download and convert image to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Log API usage to database
    const cost = 0.02; // Estimate for MidJourney generation
    await supabase
      .from('api_usage')
      .insert({
        service: 'midjourney',
        operation: 'image_generation',
        tokens_used: 1,
        cost: cost,
        model_used: model,
        test_id: testId
      });

    // Get slide details for alt text
    const { data: slide, error: slideError } = await supabase
      .from('slides')
      .select('alt_text')
      .eq('id', slideId)
      .single();

    if (slideError) {
      console.error('Failed to fetch slide details:', slideError);
    }

    // Save visual to database
    const { data: visual, error: visualError } = await supabase
      .from('visuals')
      .insert({
        slide_id: slideId,
        image_data: base64Image,
        alt_text: slide?.alt_text || 'Generated MidJourney image',
        generation_prompt: enhancedPrompt,
        style_preset: stylePreset
      })
      .select()
      .single();

    if (visualError) {
      console.error('Failed to save visual:', visualError);
      throw new Error('Failed to save generated image');
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        visualId: visual.id,
        imageData: `data:image/jpeg;base64,${base64Image}`,
        altText: visual.alt_text,
        cost: cost,
        model: model,
        taskId: taskId || null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in midjourney-image-generator function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});