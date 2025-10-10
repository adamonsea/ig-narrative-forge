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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!supabaseUrl || !supabaseKey || !lovableApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { slideId, prompt, stylePreset = 'editorial' } = await req.json();

    if (!slideId || !prompt) {
      throw new Error('Slide ID and prompt are required');
    }

    // Get slide content for text-based slide generation
    const { data: slideData, error: slideDataError } = await supabase
      .from('slides')
      .select('content, slide_number')
      .eq('id', slideId)
      .single();

    const slideContent = slideData?.content || prompt;
    
    // Enhanced prompt for text-based slide with consistent typography
    const enhancedPrompt = `Create a professional text-only social media slide. Typography: Bold modern sans-serif font (Helvetica Neue/Arial Bold), large readable text size. Display this text clearly and prominently: "${slideContent}". Layout: Centered text on clean white/light background, dark text for maximum contrast and readability, generous white space. Style: Editorial news design, no decorative elements, no illustrations, focus purely on clear legible typography. Square 1:1 format for social media.`;

    console.log('🎨 Calling Lovable AI Gateway for Gemini image generation...');

    // Generate image using Lovable AI Gateway
    const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!imageResponse.ok) {
      const errorData = await imageResponse.text();
      console.error('Lovable AI Gateway error:', errorData);
      throw new Error(`Image generation failed: ${imageResponse.status}`);
    }

    const imageData = await imageResponse.json();

    const extractImageDataUrl = (data: any): string | null => {
      const choice = data?.choices?.[0];
      const message = choice?.message ?? {};

      const legacyUrl = message?.images?.[0]?.image_url?.url;
      if (legacyUrl) return legacyUrl;

      const possibleContent = Array.isArray(message?.content)
        ? message.content
        : Array.isArray(choice?.content)
          ? choice.content
          : [];

      for (const part of possibleContent) {
        if (!part) continue;

        if (typeof part === 'string' && part.startsWith('data:image')) {
          return part;
        }

        if (typeof part === 'object') {
          if (part?.type === 'output_image' && part?.image_base64) {
            return `data:image/png;base64,${part.image_base64}`;
          }

          if (part?.image_base64) {
            return `data:image/png;base64,${part.image_base64}`;
          }

          const partUrl = part?.image_url?.url ?? part?.url;
          if (typeof partUrl === 'string') {
            return partUrl;
          }
        }
      }

      const dataArray = Array.isArray(data?.data) ? data.data : [];
      const b64Json = dataArray?.[0]?.b64_json;
      if (typeof b64Json === 'string') {
        return `data:image/png;base64,${b64Json}`;
      }

      return null;
    };

    const base64ImageUrl = extractImageDataUrl(imageData);

    if (!base64ImageUrl) {
      throw new Error('No image data received from Lovable AI Gateway');
    }

    // Extract just the base64 data (remove the data:image prefix if present)
    const base64Image = base64ImageUrl.includes('base64,')
      ? base64ImageUrl.split('base64,')[1]
      : base64ImageUrl;

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
        alt_text: slide?.alt_text || 'Generated text slide',
        generation_prompt: enhancedPrompt,
        style_preset: stylePreset
      })
      .select()
      .single();

    if (visualError) {
      console.error('Failed to save visual:', visualError);
      throw new Error('Failed to save generated image');
    }

    console.log('✅ Gemini image generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        visualId: visual.id,
        imageData: `data:image/png;base64,${base64Image}`,
        altText: visual.alt_text
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in gemini-image-generator function:', error);
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
