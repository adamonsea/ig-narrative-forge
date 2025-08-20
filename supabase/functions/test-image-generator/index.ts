import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { 
      slideId, 
      prompt, 
      apiProvider = 'openai', // 'openai' or 'ideogram'
      stylePreset = 'editorial',
      styleReferenceUrl = null,
      testId = null 
    } = await req.json();

    if (!slideId || !prompt) {
      throw new Error('Slide ID and prompt are required');
    }

    console.log(`Testing ${apiProvider} API for slide ${slideId}`);

    let imageData, cost, generationTime;
    const startTime = Date.now();

    if (apiProvider === 'ideogram') {
      if (!ideogramApiKey) {
        throw new Error('Ideogram API key not configured');
      }

      // Enhanced prompt for editorial style
      const enhancedPrompt = `Editorial news illustration: ${prompt}. Clean, professional, flat design with subtle gradients. Modern minimalist aesthetic suitable for social media carousel. High contrast, readable typography, portrait 3:4 aspect ratio.`;

      const ideogramPayload: any = {
        image_request: {
          prompt: enhancedPrompt,
          aspect_ratio: "ASPECT_3_4",
          model: "V_3_TURBO",
          magic_prompt_option: "AUTO",
          style_type: "DESIGN"
        }
      };

      // Add style reference if provided
      if (styleReferenceUrl) {
        ideogramPayload.image_request.style_reference_image_url = styleReferenceUrl;
      }

      console.log('Ideogram request payload:', JSON.stringify(ideogramPayload, null, 2));

      const ideogramResponse = await fetch('https://api.ideogram.ai/generate', {
        method: 'POST',
        headers: {
          'Api-Key': ideogramApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ideogramPayload),
      });

      if (!ideogramResponse.ok) {
        const errorData = await ideogramResponse.text();
        console.error('Ideogram API error:', errorData);
        throw new Error(`Ideogram generation failed: ${ideogramResponse.status} - ${errorData}`);
      }

      const ideogramData = await ideogramResponse.json();
      console.log('Ideogram response:', JSON.stringify(ideogramData, null, 2));

      if (!ideogramData.data || !ideogramData.data[0] || !ideogramData.data[0].url) {
        throw new Error('No image data received from Ideogram');
      }

      // Download the image and convert to base64
      const imageResponse = await fetch(ideogramData.data[0].url);
      const imageBuffer = await imageResponse.arrayBuffer();
      imageData = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      
      // Estimate cost (placeholder - actual costs need to be determined)
      cost = 0.08; // Estimated per image
      generationTime = Date.now() - startTime;

    } else {
      // OpenAI generation (existing logic)
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const enhancedPrompt = `Editorial news illustration style: ${prompt}. Clean, professional, flat design with subtle gradients. Modern minimalist aesthetic suitable for social media carousel. High contrast, readable from mobile devices. Portrait orientation 3:4 aspect ratio.`;

      const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: enhancedPrompt,
          n: 1,
          size: '1024x1536',
          quality: 'high',
          output_format: 'webp',
          output_compression: 85
        }),
      });

      if (!imageResponse.ok) {
        const errorData = await imageResponse.text();
        console.error('OpenAI Image API error:', errorData);
        throw new Error(`OpenAI image generation failed: ${imageResponse.status}`);
      }

      const openAIData = await imageResponse.json();
      imageData = openAIData.data[0].b64_json;
      
      if (!imageData) {
        throw new Error('No image data received from OpenAI');
      }

      // Estimate OpenAI cost
      cost = 0.04; // Estimated per image for gpt-image-1
      generationTime = Date.now() - startTime;
    }

    // Get slide details for alt text
    const { data: slide, error: slideError } = await supabase
      .from('slides')
      .select('alt_text, story_id')
      .eq('id', slideId)
      .single();

    if (slideError) {
      console.error('Failed to fetch slide details:', slideError);
    }

    // Save visual to database with test metadata
    const { data: visual, error: visualError } = await supabase
      .from('visuals')
      .insert({
        slide_id: slideId,
        image_data: imageData,
        alt_text: slide?.alt_text || 'Generated editorial illustration',
        generation_prompt: prompt,
        style_preset: stylePreset
      })
      .select()
      .single();

    if (visualError) {
      console.error('Failed to save visual:', visualError);
      throw new Error('Failed to save generated image');
    }

    // Log test results
    const testResult = {
      test_id: testId,
      slide_id: slideId,
      story_id: slide?.story_id,
      api_provider: apiProvider,
      generation_time_ms: generationTime,
      estimated_cost: cost,
      style_reference_used: !!styleReferenceUrl,
      success: true,
      created_at: new Date().toISOString()
    };

    // Insert test log
    await supabase
      .from('image_generation_tests')
      .insert(testResult)
      .select()
      .single()
      .catch(console.error); // Don't fail if logging fails

    const imageFormat = apiProvider === 'ideogram' ? 'jpeg' : 'webp';

    return new Response(
      JSON.stringify({ 
        success: true,
        visualId: visual.id,
        imageData: `data:image/${imageFormat};base64,${imageData}`,
        altText: visual.alt_text,
        apiProvider,
        estimatedCost: cost,
        generationTimeMs: generationTime,
        testId: testResult.test_id
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in test-image-generator function:', error);
    
    // Log failed test
    if (testId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!, 
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase
        .from('image_generation_tests')
        .insert({
          test_id: testId,
          success: false,
          error_message: error.message,
          created_at: new Date().toISOString()
        })
        .catch(console.error);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});