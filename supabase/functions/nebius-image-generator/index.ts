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
    const { slideId, prompt, model = 'black-forest-labs/flux-schnell', stylePreset = 'editorial' } = await req.json();

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
    
    // FLUX-optimized prompt using natural language for best text accuracy
    const enhancedPrompt = `A clean social media typography slide featuring the text "${slideContent}". The text should be rendered in large, bold, highly readable sans-serif font like Helvetica Neue or Arial Bold. Use pure white or light gray background with dark text for maximum contrast and readability. Center the text with generous white space margins. The design should be minimal and professional, suitable for news or editorial content. Focus entirely on making every letter crystal clear and perfectly legible - this is crucial for readability. No graphics, no decorative elements, just perfectly rendered typography in ${textCase} format.`;

    const startTime = Date.now();

    // Nebius AI Studio API call using OpenAI-compatible format
    const nebiusResponse = await fetch('https://api.studio.nebius.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nebiusApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'black-forest-labs/flux-schnell', // Use the correct model name from Nebius API
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json"
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
    
    console.log('Nebius response structure:', {
      hasData: !!nebiusData.data,
      dataLength: nebiusData.data?.length,
      keys: Object.keys(nebiusData)
    });

    if (!nebiusData.data || !nebiusData.data[0] || !nebiusData.data[0].b64_json) {
      throw new Error('No image data received from Nebius AI');
    }

    // Extract base64 image data (OpenAI format)
    const imageData = nebiusData.data[0].b64_json;

    // Calculate cost based on model
    let cost;
    switch (model) {
      case 'black-forest-labs/flux-schnell':
        cost = 0.0013; // Ultra-cheap Flux Schnell
        break;
      case 'black-forest-labs/flux-dev':
        cost = 0.0025; // Flux Dev
        break;
      case 'stability-ai/sdxl':
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

    const generationTime = Date.now() - startTime;

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