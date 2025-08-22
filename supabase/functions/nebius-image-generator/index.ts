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
    const nebiusApiKey = Deno.env.get('NEBIUS_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    if (!nebiusApiKey) {
      throw new Error('Nebius API key not configured. Please add NEBIUS_API_KEY to Supabase secrets.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { slideId, prompt, model = 'flux-schnell', stylePreset = 'editorial' } = await req.json();

    if (!slideId || !prompt) {
      throw new Error('Slide ID and prompt are required');
    }

    console.log(`Generating image with Nebius AI using ${model} model`);

    // Get slide content for text-based slide generation
    const { data: slideData, error: slideDataError } = await supabase
      .from('slides')
      .select('content, slide_number, story_id, alt_text')
      .eq('id', slideId)
      .single();

    if (slideDataError) {
      console.error('Failed to fetch slide details:', slideDataError);
    }

    const slideContent = slideData?.content || prompt;
    const isTitle = slideData?.slide_number === 1;
    const textCase = isTitle ? 'UPPERCASE BOLD TITLE TEXT' : 'Clear readable sentence case text';
    
    // Enhanced prompt for text-based slide with ultra-clear text specifications
    const enhancedPrompt = `TYPOGRAPHY POSTER: Create a professional text-only social media slide with crystal clear, perfectly readable text. Typography: Use BOLD Helvetica Neue or Arial Bold font, EXTRA LARGE text size for maximum readability. Text format: ${textCase}. Exact text to display: "${slideContent}". CRITICAL: Text must be spelled EXACTLY as written, no typos, no creative interpretation. Design: Pure white or very light background, solid black text for maximum contrast, generous margins, perfect center alignment. Style: Clean editorial newspaper design, absolutely NO graphics, NO decorative elements, NO illustrations - ONLY text. Ensure every letter is crystal clear and perfectly legible.`;

    const startTime = Date.now();

    // Nebius AI Studio API call
    const nebiusResponse = await fetch('https://api.studio.nebius.ai/v1/text-to-image/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nebiusApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model, // flux-schnell, flux-dev, or sdxl
        prompt: enhancedPrompt,
        width: 1024,
        height: 1024,
        steps: model === 'flux-schnell' ? 4 : 28,
        guidance_scale: model.startsWith('flux') ? 3.5 : 7.5,
        seed: Math.floor(Math.random() * 1000000),
        output_format: 'webp'
      }),
    });

    console.log('Nebius response status:', nebiusResponse.status);

    if (!nebiusResponse.ok) {
      const errorData = await nebiusResponse.text();
      console.error('Nebius AI API error:', errorData);

      // Log API usage for failed request
      await supabase.from('api_usage').insert({
        service_name: 'Nebius AI',
        operation: 'text-to-image-failed',
        cost_usd: 0,
        tokens_used: 0,
        region: 'global'
      });

      throw new Error(`Nebius generation failed: ${nebiusResponse.status} - ${errorData}`);
    }

    const nebiusData = await nebiusResponse.json();
    const generationTime = Date.now() - startTime;
    
    console.log('Nebius response structure:', {
      hasImages: !!nebiusData.images,
      imagesLength: nebiusData.images?.length,
      keys: Object.keys(nebiusData)
    });

    if (!nebiusData.images || !nebiusData.images[0]) {
      throw new Error('No image data received from Nebius AI');
    }

    // Extract base64 or URL from response
    let imageData;
    const imageResult = nebiusData.images[0];
    
    if (imageResult.b64_json) {
      // Base64 response
      imageData = imageResult.b64_json;
    } else if (imageResult.url) {
      // URL response - download and convert to base64
      const imageResponse = await fetch(imageResult.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from Nebius: ${imageResponse.status}`);
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
    } else {
      throw new Error('No valid image format received from Nebius AI');
    }

    // Calculate cost based on model
    let cost;
    switch (model) {
      case 'flux-schnell':
        cost = 0.0013; // Ultra-cheap Flux Schnell
        break;
      case 'flux-dev':
        cost = 0.0025; // Flux Dev
        break;
      case 'sdxl':
        cost = 0.002; // SDXL
        break;
      default:
        cost = 0.0013;
    }

    // Log API usage
    await supabase.from('api_usage').insert({
      service_name: 'Nebius AI',
      operation: `text-to-image-${model}`,
      cost_usd: cost,
      tokens_used: Math.ceil(enhancedPrompt.length / 4), // Estimate token usage
      region: 'global'
    });

    console.log(`Generated image with Nebius AI ${model}, cost: $${cost}, time: ${generationTime}ms`);

    // Save visual to database
    const { data: visual, error: visualError } = await supabase
      .from('visuals')
      .insert({
        slide_id: slideId,
        image_data: imageData,
        alt_text: slideData?.alt_text || 'Generated text slide via Nebius AI',
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
        imageData: `data:image/webp;base64,${imageData}`,
        altText: visual.alt_text,
        cost: cost,
        generationTime: generationTime,
        provider: 'nebius-ai',
        model: model
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in nebius-image-generator function:', error);
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