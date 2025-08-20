import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== TEST IMAGE GENERATOR FUNCTION STARTED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  let requestBody;
  try {
    console.log('Parsing request body...');
    requestBody = await req.json();
    console.log('Request body parsed successfully:', requestBody);
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    console.log('Reading environment variables...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    const ideogramApiKey = Deno.env.get('IDEOGRAM_API_KEY');
    
    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseKey: !!supabaseKey,
      openAIApiKey: !!openAIApiKey,
      ideogramApiKey: !!ideogramApiKey
    });
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required Supabase environment variables'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { 
      slideId, 
      prompt, 
      apiProvider = 'openai',
      stylePreset = 'editorial',
      styleReferenceUrl = null,
      testId = null 
    } = requestBody;

    console.log('Extracted parameters:', {
      slideId,
      prompt: prompt?.substring(0, 100) + '...',
      apiProvider,
      stylePreset,
      hasStyleReference: !!styleReferenceUrl,
      testId
    });

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

      // Create FormData for Ideogram V3 API (requires multipart form data)
      const formData = new FormData();
      formData.append('prompt', enhancedPrompt);
      formData.append('aspect_ratio', '3:4');
      formData.append('style_type', 'DESIGN');
      formData.append('rendering_speed', 'DEFAULT');

      // Add style reference image if provided
      if (styleReferenceUrl) {
        // For style reference, we would need to download and append the image file
        // This is a more complex implementation that would require downloading the image first
        console.log('Style reference URL provided but not implemented yet:', styleReferenceUrl);
      }

      console.log('Ideogram V3 request parameters:', {
        prompt: enhancedPrompt.substring(0, 100) + '...',
        aspect_ratio: '3:4',
        style_type: 'DESIGN',
        rendering_speed: 'DEFAULT'
      });

      const ideogramResponse = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
        method: 'POST',
        headers: {
          'Api-Key': ideogramApiKey,
          // Note: Don't set Content-Type for FormData - let the browser set it with boundary
        },
        body: formData,
      });

      console.log('Ideogram response status:', ideogramResponse.status);

      if (!ideogramResponse.ok) {
        const errorData = await ideogramResponse.text();
        console.error('Ideogram V3 API error:', errorData);
        throw new Error(`Ideogram generation failed: ${ideogramResponse.status} - ${errorData}`);
      }

      const ideogramData = await ideogramResponse.json();
      console.log('Ideogram V3 response structure:', {
        hasData: !!ideogramData.data,
        dataLength: ideogramData.data?.length,
        firstItemKeys: ideogramData.data?.[0] ? Object.keys(ideogramData.data[0]) : null
      });

      if (!ideogramData.data || !ideogramData.data[0] || !ideogramData.data[0].url) {
        console.error('Invalid Ideogram V3 response:', ideogramData);
        throw new Error('No image data received from Ideogram V3 API');
      }

      // Download the image and convert to base64
      const imageResponse = await fetch(ideogramData.data[0].url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Ideogram: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      imageData = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      
      console.log(`Generated image with Ideogram V3, size: ${imageBuffer.byteLength} bytes`);
      
      // Estimate cost (Ideogram V3 pricing)
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
          model: 'dall-e-3',
          prompt: enhancedPrompt,
          n: 1,
          size: '1024x1792',
          quality: 'hd'
        }),
      });

      if (!imageResponse.ok) {
        const errorData = await imageResponse.text();
        console.error('OpenAI Image API error:', errorData);
        throw new Error(`OpenAI image generation failed: ${imageResponse.status}`);
      }

      const openAIData = await imageResponse.json();
      
      // Handle both b64_json and url responses
      if (openAIData.data[0].b64_json) {
        imageData = openAIData.data[0].b64_json;
      } else if (openAIData.data[0].url) {
        // Download image from URL and convert to base64
        const imgResponse = await fetch(openAIData.data[0].url);
        const imgBuffer = await imgResponse.arrayBuffer();
        imageData = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
      }
      
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
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});