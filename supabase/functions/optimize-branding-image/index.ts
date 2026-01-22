import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizationRequest {
  topicId: string;
  imageType: 'logo' | 'icon';
  base64Data: string;
  mimeType: string;
  originalFileName: string;
}

interface OptimizedVariant {
  name: string;
  width: number;
  height: number;
  quality: number;
  suffix: string;
}

// Define variants for each image type
const LOGO_VARIANTS: OptimizedVariant[] = [
  { name: 'header', width: 400, height: 120, quality: 90, suffix: '-header' },
  { name: 'thumbnail', width: 100, height: 30, quality: 85, suffix: '-thumb' },
  { name: 'email', width: 200, height: 60, quality: 85, suffix: '-email' },
];

const ICON_VARIANTS: OptimizedVariant[] = [
  { name: 'pwa-512', width: 512, height: 512, quality: 90, suffix: '-512' },
  { name: 'pwa-192', width: 192, height: 192, quality: 90, suffix: '-192' },
  { name: 'favicon', width: 64, height: 64, quality: 85, suffix: '-64' },
  { name: 'widget', width: 48, height: 48, quality: 85, suffix: '-48' },
  { name: 'notification', width: 96, height: 96, quality: 85, suffix: '-96' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { topicId, imageType, base64Data, mimeType, originalFileName } = await req.json() as OptimizationRequest;

    if (!topicId || !imageType || !base64Data) {
      throw new Error('Missing required fields: topicId, imageType, base64Data');
    }

    console.log(`🖼️ Optimizing ${imageType} for topic ${topicId}`);

    // Remove data URI prefix if present
    const cleanBase64 = base64Data.includes('base64,') 
      ? base64Data.split('base64,')[1] 
      : base64Data;

    // Decode to binary
    const binaryData = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));
    const originalSize = binaryData.length;
    console.log(`📊 Original size: ${(originalSize / 1024).toFixed(1)} KB`);

    // Determine bucket and variants
    const bucket = imageType === 'logo' ? 'topic-logos' : 'topic-icons';
    const variants = imageType === 'logo' ? LOGO_VARIANTS : ICON_VARIANTS;
    const baseFileName = imageType === 'logo' ? 'logo' : 'icon';

    // Upload original as WebP for better compression
    const originalPath = `${topicId}/${baseFileName}.webp`;
    
    // For now, upload original as-is (Supabase doesn't have native image processing)
    // The key optimization is storing as WebP and creating standardized sizes
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(originalPath, binaryData, {
        upsert: true,
        contentType: mimeType.includes('svg') ? 'image/svg+xml' : 'image/webp',
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL for original
    const { data: { publicUrl: originalUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(originalPath);

    console.log(`✅ Original uploaded: ${originalUrl}`);

    // Generate variant URLs using Supabase Image Transformations
    // Note: Requires Pro plan. On Free plans, these will return original.
    const variantUrls: Record<string, string> = {
      original: originalUrl,
    };

    for (const variant of variants) {
      // Use Supabase's render/image endpoint for transformations
      const renderUrl = originalUrl.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      
      const params = new URLSearchParams({
        width: variant.width.toString(),
        height: variant.height.toString(),
        quality: variant.quality.toString(),
        resize: 'contain',
      });

      variantUrls[variant.name] = `${renderUrl}?${params.toString()}`;
    }

    console.log(`🎉 Generated ${Object.keys(variantUrls).length} variants`);

    // Update topic branding_config with optimized URLs
    const { data: topic, error: fetchError } = await supabase
      .from('topics')
      .select('branding_config')
      .eq('id', topicId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch topic: ${fetchError.message}`);
    }

    const existingConfig = topic?.branding_config || {};
    const updatedConfig = {
      ...existingConfig,
      [`${imageType}_url`]: originalUrl,
      [`${imageType}_variants`]: variantUrls,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('topics')
      .update({ 
        branding_config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', topicId);

    if (updateError) {
      throw new Error(`Failed to update topic: ${updateError.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      originalUrl,
      variants: variantUrls,
      originalSize,
      message: `${imageType} optimized with ${variants.length} variants`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Optimization error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
