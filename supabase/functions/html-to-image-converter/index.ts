import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConvertRequest {
  html: string;
  width?: number;
  height?: number;
  format?: 'png' | 'webp' | 'jpeg';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { html, width = 1080, height = 1080, format = 'png' }: ConvertRequest = await req.json();

    if (!html) {
      return new Response(
        JSON.stringify({ error: 'HTML content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔄 Converting HTML to image...');
    
    // Use htmlcsstoimage.com API as a reliable alternative to Playwright
    const hctiApiUserId = Deno.env.get('HTMLCSSTOIMAGE_USER_ID');
    const hctiApiKey = Deno.env.get('HTMLCSSTOIMAGE_API_KEY');
    
    if (!hctiApiUserId || !hctiApiKey) {
      console.log('⚠️ HTMLCSSTOIMAGE credentials not found, falling back to mock response');
      
      // For development, return a mock success response
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'HTML to image conversion requires HTMLCSSTOIMAGE_USER_ID and HTMLCSSTOIMAGE_API_KEY secrets to be configured',
          html: html,
          error: 'Missing API credentials'
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call htmlcsstoimage.com API
    const response = await fetch('https://hcti.io/v1/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${hctiApiUserId}:${hctiApiKey}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: html,
        width: width,
        height: height,
        device_scale: 2,
        format: format,
        wait: 1000, // Wait 1 second for fonts to load
        google_fonts: 'Inter:300,400,500,600,700',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('HCTI API error:', errorData);
      throw new Error(`HCTI API error: ${response.status} ${errorData}`);
    }

    const result = await response.json();
    console.log('✅ Image generated successfully:', result.url);

    // Download the generated image
    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    console.log(`📸 Downloaded image: ${imageBlob.size} bytes`);

    // Convert blob to base64 for return
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    return new Response(
      JSON.stringify({ 
        success: true,
        image: `data:image/${format};base64,${base64}`,
        size: imageBlob.size,
        url: result.url
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in html-to-image-converter:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});