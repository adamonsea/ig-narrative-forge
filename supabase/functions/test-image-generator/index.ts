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
    const replicateApiToken = Deno.env.get('REPLICATE_API_TOKEN');
    
    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseKey: !!supabaseKey,
      openAIApiKey: !!openAIApiKey,
      ideogramApiKey: !!ideogramApiKey,
      falApiKey: !!falApiKey,
      replicateApiToken: !!replicateApiToken
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

    // Get slide details including content for text-based slide generation
    const { data: slide, error: slideError } = await supabase
      .from('slides')
      .select('alt_text, story_id, content, slide_number')
      .eq('id', slideId)
      .single();

    if (slideError) {
      console.error('Failed to fetch slide details:', slideError);
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

      // Enhanced prompt for text-based slide with consistent typography
      const slideContent = slide?.content || sanitizedPrompt;
      // Determine if this is a title slide or supporting slide based on slide number
      const isTitle = slide?.slide_number === 1;
      const textCase = isTitle ? 'UPPERCASE TITLE TEXT' : 'Sentence case text';
      
      const enhancedPrompt = `Create a clean text-based social media slide. Typography: Use modern sans-serif font (Helvetica or Arial family). Text formatting: ${textCase}. Display this text: "${slideContent}". Layout: Centered text on solid background color, generous white space, high contrast for readability. Style: Minimal design, no decorative elements, no illustrations, focus purely on typography and text hierarchy. Format: Square 1:1 aspect ratio for social media.`;

      // Create FormData for Ideogram V3 API (requires multipart form data)
      const formData = new FormData();
      formData.append('prompt', enhancedPrompt);
      formData.append('aspect_ratio', '1x1');  // Use 1x1 format, not 1:1
      formData.append('style_type', 'DESIGN');
      formData.append('rendering_speed', 'DEFAULT');

      // Add style reference image if provided
      if (styleReferenceUrl) {
        try {
          console.log('Downloading style reference for Ideogram:', styleReferenceUrl);
          // Download the style reference image
          const styleImageResponse = await fetch(styleReferenceUrl);
          if (styleImageResponse.ok) {
            const styleImageBlob = await styleImageResponse.blob();
            formData.append('style_reference_image', styleImageBlob, 'style_reference.jpg');
            console.log('Style reference image added to Ideogram request');
          } else {
            console.warn('Failed to download style reference image:', styleImageResponse.status);
          }
        } catch (error) {
          console.warn('Error downloading style reference image:', error);
          // Continue without style reference
        }
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
         
         // Log test failure to database
         await supabase.from('image_generation_tests').insert({
           test_id: testId || null,
           slide_id: slideId || null,
           story_id: slide?.story_id || null,
           api_provider: 'ideogram',
           success: false,
           error_message: `Ideogram API error: ${ideogramResponse.status} - ${errorData}`,
           generation_time_ms: Date.now() - startTime,
           estimated_cost: 0,
           style_reference_used: !!styleReferenceUrl
         });
         
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
         
         // Log test failure to database
         await supabase.from('image_generation_tests').insert({
           test_id: testId || null,
           slide_id: slideId || null,
           story_id: slide?.story_id || null,
           api_provider: 'ideogram',
           success: false,
           error_message: 'No image data received from Ideogram V3 API',
           generation_time_ms: Date.now() - startTime,
           estimated_cost: 0.08,
           style_reference_used: !!styleReferenceUrl
         });
         
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

      // Enhanced prompt for text-based slide  
      const slideContent = slide?.content || sanitizedPrompt;
      const isTitle = slide?.slide_number === 1;
      const textCase = isTitle ? 'UPPERCASE TITLE TEXT' : 'Sentence case text';
      
      const enhancedPrompt = `Typography-focused social media slide. Font: Modern sans-serif (Helvetica/Arial). Text case: ${textCase}. Content: "${slideContent}". Layout: Centered text, solid background, high contrast, minimal design, no decorative elements.`;

      console.log(`Testing fal.ai FLUX Pro API for slide ${slideId}`);

      // Using direct Fal.ai endpoint (non-queued) with correct model
      const falResponse = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true
        }),
      });

      console.log('Fal.ai response status:', falResponse.status);

      if (!falResponse.ok) {
        const errorData = await falResponse.text();
        console.error('Fal.ai API error:', errorData);
        
        // Log test failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'fal',
          success: false,
          error_message: `Fal.ai API error: ${falResponse.status} - ${errorData}`,
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error(`Fal.ai generation failed: ${falResponse.status} - ${errorData}`);
      }

      const falData = await falResponse.json();
      console.log('Fal.ai direct response structure:', {
        hasImages: !!falData.images,
        imagesLength: falData.images?.length,
        hasData: !!falData.data,
        keys: Object.keys(falData)
      });

      // Extract image URL from response
      let imageUrl = null;
      if (falData.images && falData.images.length > 0) {
        imageUrl = falData.images[0].url;
      } else if (falData.data && falData.data.images && falData.data.images.length > 0) {
        imageUrl = falData.data.images[0].url;
      } else {
        console.error('No image URL in Fal.ai response:', JSON.stringify(falData, null, 2));
        
        // Log test failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'fal',
          success: false,
          error_message: 'No image URL in Fal.ai response',
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0.003,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error('No image data received from Fal.ai API');
      }

      // Download the image and convert to base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Fal.ai: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imageBuffer);
      
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      imageData = btoa(binary);
      
      console.log(`Generated image with Fal.ai FLUX Schnell, size: ${imageBuffer.byteLength} bytes`);
      
      // Estimate cost (Fal.ai FLUX Schnell pricing)
      cost = 0.003;
      generationTime = Date.now() - startTime;

    } else if (apiProvider === 'replicate') {
      if (!replicateApiToken) {
        throw new Error('Replicate API token not configured');
      }

      // Sanitize prompt to avoid content policy violations
      const sanitizedPrompt = prompt
        .replace(/terrifying|scary|frightening|fear|panic|drama|crisis|tragedy/gi, 'news story')
        .replace(/death|died|killed|murder|violence|attack/gi, 'incident')
        .replace(/disaster|catastrophe|horror|nightmare/gi, 'event');

      // Enhanced prompt for text-based slide  
      const slideContent = slide?.content || sanitizedPrompt;
      const isTitle = slide?.slide_number === 1;
      const textCase = isTitle ? 'UPPERCASE TITLE TEXT' : 'Sentence case text';
      
      const enhancedPrompt = `Clean typography-based social media slide. Modern sans-serif font (Helvetica family). ${textCase}. Text content: "${slideContent}". Centered layout, solid color background, high contrast, minimal design, no graphics or decorative elements.`;

      console.log(`Testing Replicate FLUX Pro API for slide ${slideId}`);

       // Using Replicate FLUX Schnell (faster, cheaper alternative)
       const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${replicateApiToken}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           version: "f15c956a9a1002d21453c23db2adb4cb8d76fb8e5da7fd4da355e62e9de7bb1c", // FLUX.1 Schnell (correct version)
            input: {
              prompt: enhancedPrompt,
              aspect_ratio: "9:16", // Portrait for social media
              output_format: "webp",
              output_quality: 90,
              num_outputs: 1, // Ensure single image
              num_inference_steps: 4
            }
         }),
       });

      console.log('Replicate response status:', replicateResponse.status);

       if (!replicateResponse.ok) {
         const errorData = await replicateResponse.text();
         console.error('Replicate API error:', errorData);
         
         // Log test failure to database
         await supabase.from('image_generation_tests').insert({
           test_id: testId || null,
           slide_id: slideId || null,
           story_id: slide?.story_id || null,
           api_provider: 'replicate',
           success: false,
           error_message: `Replicate API error: ${replicateResponse.status} - ${errorData}`,
           generation_time_ms: Date.now() - startTime,
           estimated_cost: 0,
           style_reference_used: !!styleReferenceUrl
         });
         
         throw new Error(`Replicate generation failed: ${replicateResponse.status} - ${errorData}`);
       }

      const replicateData = await replicateResponse.json();
      console.log('Replicate initial response:', replicateData.status);

      // Poll for completion if needed
      let attempts = 0;
      const maxAttempts = 30;
      let finalData = replicateData;

      while (finalData.status !== 'succeeded' && finalData.status !== 'failed' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${finalData.id}`, {
          headers: {
            'Authorization': `Bearer ${replicateApiToken}`,
          },
        });
        
        if (statusResponse.ok) {
          finalData = await statusResponse.json();
          console.log(`Replicate poll ${attempts}/${maxAttempts}:`, finalData.status);
        }
      }

      if (finalData.status === 'failed') {
        console.error('Replicate generation failed with error:', finalData.error);
        
        // Log failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'replicate',
          success: false,
          error_message: `Replicate generation failed: ${finalData.error || 'Unknown error'}`,
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error(`Replicate generation failed: ${finalData.error || 'Unknown error'}`);
      }

      console.log('Replicate final result status:', finalData.status);
      console.log('Replicate final result output:', finalData.output ? 'present' : 'missing');
      
      if (!finalData.output || finalData.output.length === 0) {
        console.error('No image URL in Replicate response:', JSON.stringify(finalData, null, 2));
        
        // Log failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'replicate',
          success: false,
          error_message: 'No image URL received from Replicate',
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error('No image URL received from Replicate');
      }

      // Download the image and convert to base64
      const imageResponse = await fetch(finalData.output[0]);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Replicate: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imageBuffer);
      
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      imageData = btoa(binary);
      
      console.log(`Generated image with Replicate FLUX Pro, size: ${imageBuffer.byteLength} bytes`);
      
       // Estimate cost (Replicate FLUX Schnell pricing)
       cost = 0.003; // FLUX Schnell is much cheaper
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

      const slideContent = slide?.content || sanitizedPrompt;
      const enhancedPrompt = `Create a simple text-based social media slide. Display this text clearly and prominently: "${slideContent}". Use a solid background color, large readable typography, clean minimal layout. No illustrations or decorative graphics - focus only on text presentation and readability. Portrait orientation suitable for social media carousel.`;

      console.log(`Testing openai gpt-image-1 API for slide ${slideId}`);

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
        
        // Log test failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'openai',
          success: false,
          error_message: `OpenAI API error: ${imageResponse.status} - ${errorData}`,
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error(`OpenAI image generation failed: ${imageResponse.status}`);
      }

      const openAIData = await imageResponse.json();
      
      // GPT-Image-1 returns base64 data directly
      imageData = openAIData.data[0].b64_json;
      
      if (!imageData) {
        // Log test failure to database
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: 'openai',
          success: false,
          error_message: 'No image data received from OpenAI',
          generation_time_ms: Date.now() - startTime,
          estimated_cost: 0.08,
          style_reference_used: !!styleReferenceUrl
        });
        
        throw new Error('No image data received from OpenAI');
      }

      // Estimate OpenAI cost
      cost = 0.08; // Estimated per image for gpt-image-1
      generationTime = Date.now() - startTime;
    }

    // Save visual to database FIRST
    console.log('Saving visual to database...');
    const { data: visual, error: visualError } = await supabase
      .from('visuals')
      .insert({
        slide_id: slideId,
        image_data: imageData,
        alt_text: slide?.alt_text || 'Generated text slide',
        generation_prompt: prompt,
        style_preset: stylePreset
      })
      .select()
      .single();

    if (visualError) {
      console.error('Failed to save visual:', visualError);
      throw new Error('Failed to save generated image');
    }

    // Log test results AFTER visual is saved
    console.log('Logging test results to database...');
    const testResult = {
      test_id: testId,
      slide_id: slideId,
      story_id: slide?.story_id,
      api_provider: apiProvider,
      generation_time_ms: generationTime,
      estimated_cost: cost,
      style_reference_used: !!styleReferenceUrl,
      success: true,
      visual_id: visual.id // Link to the specific visual generated
    };
    
    console.log('Test result payload:', testResult);

    // Insert test log after visual is saved
    const { data: testLog, error: testLogError } = await supabase
      .from('image_generation_tests')
      .insert(testResult)
      .select()
      .single();

    if (testLogError) {
      console.error('Failed to log test result:', testLogError);
      // Don't fail the main function if logging fails, but we should know about it
    } else {
      console.log('Test result logged successfully:', testLog?.id);
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
    
    // Log failed test result to database
    try {
      const { slideId, testId, apiProvider = 'unknown' } = requestBody || {};
      const startTime = Date.now();
      
      if (slideId) {
        // Get slide details for story_id
        const { data: slide } = await supabase
          .from('slides')
          .select('story_id')
          .eq('id', slideId)
          .single();
          
        await supabase.from('image_generation_tests').insert({
          test_id: testId || null,
          slide_id: slideId || null,
          story_id: slide?.story_id || null,
          api_provider: apiProvider,
          success: false,
          error_message: error.message || 'Unknown error occurred',
          generation_time_ms: 0,
          estimated_cost: 0,
          style_reference_used: false
        });
      }
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
    
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