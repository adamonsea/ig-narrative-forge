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
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    if (!kieApiKey) {
      throw new Error('KIE_AI_API_KEY not configured - MidJourney generation unavailable');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { storyId, prompt, speed = 'relaxed' } = await req.json();

    if (!storyId || !prompt) {
      throw new Error('Story ID and prompt are required');
    }

    console.log(`MidJourney generation for story ${storyId}, speed: ${speed}`);

    // Style reference URL for consistent brand aesthetic
    const styleRefUrl = 'https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/visuals/story-ec6b6ceb-2a8c-4bfa-b3bd-5b9bdbc3f80e-1769511050468.webp';
    
    // Enhanced prompt for MidJourney with aspect ratio, quality, and style reference
    const enhancedPrompt = `${prompt} --ar 3:2 --v 7 --quality 1 --style raw --sref ${styleRefUrl}`;
    console.log(`MidJourney enhanced prompt: ${enhancedPrompt.substring(0, 300)}...`);

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
        speed: speed, // 'fast' or 'relaxed'
        aspectRatio: '3:2',
        version: '7'
      }),
    });

    console.log(`MidJourney API response status: ${mjResponse.status}`);

    if (!mjResponse.ok) {
      const errorData = await mjResponse.text();
      console.error('MidJourney API error:', errorData);
      throw new Error(`MidJourney generation failed: ${mjResponse.status} - ${errorData}`);
    }

    const mjData = await mjResponse.json();
    console.log('MidJourney response data:', JSON.stringify(mjData).substring(0, 500));
    
    // Check if the API call was successful
    if (mjData.code !== 200 || !mjData.data?.taskId) {
      throw new Error(`MidJourney API error: ${mjData.msg || 'Unknown error'}`);
    }

    const taskId = mjData.data.taskId;
    let imageUrl: string | null = null;
    
    // Poll for completion (max 3 minutes for MidJourney)
    // Fast mode: ~30 seconds, Relaxed mode: ~2-3 minutes
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
        console.log(`Poll attempt ${attempts + 1}, status:`, statusData.data?.successFlag);
        
        if (statusData.code === 200 && statusData.data?.successFlag === 1) {
          // Generation completed successfully
          const resultUrls = statusData.data.resultInfoJson?.resultUrls;
          if (resultUrls && resultUrls.length > 0) {
            imageUrl = resultUrls[0].resultUrl; // Use the first generated image
            console.log('MidJourney generation completed, image URL:', imageUrl);
            break;
          }
        } else if (statusData.data?.successFlag === 0) {
          // Still processing, continue polling
          console.log('Still processing...');
        } else if (statusData.data?.successFlag === -1) {
          // Generation failed
          throw new Error(`MidJourney generation failed: ${statusData.data?.failReason || 'Unknown error'}`);
        }
      }
      
      attempts++;
    }
    
    if (!imageUrl) {
      throw new Error('MidJourney generation timed out after 3 minutes');
    }

    // Download the generated image
    console.log('Downloading image from MidJourney...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);
    
    // Convert to base64 using chunked approach for large images
    const chunkSize = 0x8000; // 32KB chunks
    let base64Image = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      base64Image += String.fromCharCode(...chunk);
    }
    base64Image = btoa(base64Image);

    // Upload to Supabase Storage
    const fileName = `midjourney-${storyId}-${Date.now()}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('story-illustrations')
      .upload(fileName, uint8Array, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      // Fall back to base64 response
      return new Response(
        JSON.stringify({ 
          success: true,
          imageData: `data:image/jpeg;base64,${base64Image}`,
          taskId,
          speed,
          generationTimeSeconds: attempts * 5
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('story-illustrations')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl;

    // Update story with new cover URL
    const { error: updateError } = await supabase
      .from('stories')
      .update({ 
        cover_illustration_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', storyId);

    if (updateError) {
      console.error('Failed to update story:', updateError);
    }

    // Log API usage
    const cost = speed === 'fast' ? 0.04 : 0.02;
    await supabase
      .from('api_usage')
      .insert({
        service_name: 'midjourney',
        operation: `image_generation_${speed}`,
        tokens_used: 1,
        cost_usd: cost
      });

    console.log(`MidJourney generation successful for story ${storyId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl: publicUrl,
        imageData: `data:image/jpeg;base64,${base64Image}`,
        taskId,
        speed,
        cost,
        generationTimeSeconds: attempts * 5
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
