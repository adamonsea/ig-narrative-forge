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
    const falApiKey = Deno.env.get('FAL_API_KEY');
    
    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseKey: !!supabaseKey,
      openAIApiKey: !!openAIApiKey,
      ideogramApiKey: !!ideogramApiKey,
      falApiKey: !!falApiKey
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

      // Sanitize prompt to avoid content policy violations
      const sanitizedPrompt = prompt
        .replace(/terrifying|scary|frightening|fear|panic|drama|crisis|tragedy/gi, 'news story')
        .replace(/death|died|killed|murder|violence|attack/gi, 'incident')
        .replace(/disaster|catastrophe|horror|nightmare/gi, 'event');

      // Enhanced prompt for editorial style
      const enhancedPrompt = `Editorial news illustration: Clean professional graphic design for "${sanitizedPrompt}". Modern minimalist social media post design, flat vector style, bold typography, high contrast colors, square 1:1 format suitable for Instagram.`;

      // Create FormData for Ideogram V3 API (requires multipart form data)
      const formData = new FormData();
      formData.append('prompt', enhancedPrompt);
      formData.append('aspect_ratio', '1x1');  // Use 1x1 format, not 1:1
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
        aspect_ratio: '1x1',
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

      // Download the image and convert to base64 (handle large images safely)
      const imageResponse = await fetch(ideogramData.data[0].url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Ideogram: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imageBuffer);
      
      // Convert to base64 in chunks to avoid stack overflow
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      imageData = btoa(binary);
      
      console.log(`Generated image with Ideogram V3, size: ${imageBuffer.byteLength} bytes`);
      
      // Estimate cost (Ideogram V3 pricing)
      cost = 0.08; // Estimated per image
      generationTime = Date.now() - startTime;

    } else if (apiProvider === 'fal') {
      if (!falApiKey) {
        throw new Error('Fal.ai API key not configured');
      }

      // Sanitize prompt to avoid content policy violations
      const sanitizedPrompt = prompt
        .replace(/terrifying|scary|frightening|fear|panic|drama|crisis|tragedy/gi, 'news story')
        .replace(/death|died|killed|murder|violence|attack/gi, 'incident')
        .replace(/disaster|catastrophe|horror|nightmare/gi, 'event');

      // Enhanced prompt for editorial style
      const enhancedPrompt = `Professional editorial news illustration: Clean modern graphic design for "${sanitizedPrompt}". Minimalist flat design style, bold typography, high contrast colors, social media optimized, square format.`;

      console.log(`Testing fal.ai API for slide ${slideId}`);

      // Using fal.ai FLUX schnell model
      const falResponse = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          image_size: 'square_hd',
          num_inference_steps: 4,
          guidance_scale: 3.5,
          num_images: 1,
          enable_safety_checker: true,
          output_format: 'jpeg'
        }),
      });

      console.log('Fal.ai response status:', falResponse.status);

      if (!falResponse.ok) {
        const errorData = await falResponse.text();
        console.error('Fal.ai API error:', errorData);
        throw new Error(`Fal.ai generation failed: ${falResponse.status} - ${errorData}`);
      }

      const falData = await falResponse.json();
      console.log('Fal.ai response structure:', {
        hasImages: !!falData.images,
        imageCount: falData.images?.length,
        firstImageKeys: falData.images?.[0] ? Object.keys(falData.images[0]) : null
      });

      if (!falData.images || !falData.images[0] || !falData.images[0].url) {
        console.error('Invalid Fal.ai response:', falData);
        throw new Error('No image data received from Fal.ai API');
      }

      // Download the image and convert to base64
      const imageResponse = await fetch(falData.images[0].url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Fal.ai: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imageBuffer);
      
      // Convert to base64 in chunks to avoid stack overflow
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      imageData = btoa(binary);
      
      console.log(`Generated image with Fal.ai FLUX, size: ${imageBuffer.byteLength} bytes`);
      
      // Estimate cost (Fal.ai pricing - typically cheaper than alternatives)
      cost = 0.02; // Estimated per image for FLUX schnell
      generationTime = Date.now() - startTime;

    } else {
      // OpenAI generation (existing logic)
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Sanitize prompt to avoid content policy violations  
      const sanitizedPrompt = prompt
        .replace(/terrifying|scary|frightening|fear|panic|drama|crisis|tragedy/gi, 'news story')
        .replace(/death|died|killed|murder|violence|attack/gi, 'incident')
        .replace(/disaster|catastrophe|horror|nightmare/gi, 'event');

      const enhancedPrompt = `Professional editorial graphic design: Clean modern illustration for "${sanitizedPrompt}". Minimalist flat design style, bold typography, high contrast, suitable for social media. Square 1:1 aspect ratio format.`;

      console.log(`Testing openai API for slide ${slideId}`);

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
          size: '1024x1024',
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
        // Download image from URL and convert to base64 (handle large images safely)
        const imgResponse = await fetch(openAIData.data[0].url);
        const imgBuffer = await imgResponse.arrayBuffer();
        const uint8Array = new Uint8Array(imgBuffer);
        
        // Convert to base64 in chunks to avoid stack overflow
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        imageData = btoa(binary);
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
    const { data: testLog, error: testLogError } = await supabase
      .from('image_generation_tests')
      .insert(testResult)
      .select()
      .single();

    if (testLogError) {
      console.error('Failed to log test result:', testLogError);
      // Don't fail the main function if logging fails
    }

    const imageFormat = apiProvider === 'ideogram' ? 'jpeg' : 
                      apiProvider === 'fal' ? 'jpeg' : 'webp';

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