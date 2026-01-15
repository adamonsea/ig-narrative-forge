import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { limit = 50, dryRun = false } = await req.json().catch(() => ({}));

    console.log(`🔍 Finding unoptimized images (limit: ${limit}, dryRun: ${dryRun})`);

    // Find stories with PNG images (not yet optimized to WebP)
    const { data: stories, error: fetchError } = await supabase
      .from('stories')
      .select('id, title, cover_illustration_url')
      .not('cover_illustration_url', 'is', null)
      .like('cover_illustration_url', '%.png')
      .order('illustration_generated_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch stories: ${fetchError.message}`);
    }

    console.log(`📋 Found ${stories?.length || 0} PNG images to optimize`);

    if (!stories || stories.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No PNG images found to optimize',
          optimized: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dryRun) {
      const totalSize = stories.map(s => s.title).join(', ');
      return new Response(
        JSON.stringify({ 
          success: true, 
          dryRun: true,
          message: `Would optimize ${stories.length} images`,
          stories: stories.map(s => ({ id: s.id, title: s.title, url: s.cover_illustration_url }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process images
    const results: { id: string; title: string; status: string; oldSize?: number; newSize?: number; reduction?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const story of stories) {
      try {
        console.log(`\n🖼️ Processing: ${story.title}`);
        
        // Extract filename from URL
        const url = story.cover_illustration_url;
        const oldFileName = url.split('/').pop()!;
        
        // Download original image
        console.log(`⬇️ Downloading: ${oldFileName}`);
        const imageResponse = await fetch(url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`);
        }
        
        const originalBytes = new Uint8Array(await imageResponse.arrayBuffer());
        const originalSize = originalBytes.length;
        console.log(`📊 Original size: ${(originalSize / 1024).toFixed(0)} KB`);

        // For now, we'll re-upload as-is but with proper content type
        // True optimization would require an image processing library
        // The main benefit is that NEW images are now WebP
        
        // Create new filename with jpg extension
        const newFileName = oldFileName.replace('.png', '.jpg');
        
        // Use OpenAI to regenerate as optimized WebP (costs credits but ensures quality)
        // Alternative: Just mark these as "legacy" and let new generations be WebP
        
        // For this batch, we'll just log what would be optimized
        // Full re-generation would be expensive
        results.push({
          id: story.id,
          title: story.title,
          status: 'identified',
          oldSize: originalSize,
          reduction: 'Requires regeneration for WebP format'
        });
        
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error processing ${story.title}:`, error);
        results.push({
          id: story.id,
          title: story.title,
          status: 'error',
        });
        errorCount++;
      }
    }

    // Summary
    const summary = {
      success: true,
      message: `Identified ${successCount} images for optimization, ${errorCount} errors`,
      total: stories.length,
      identified: successCount,
      errors: errorCount,
      results,
      note: 'PNG images identified. To fully optimize, regenerate illustrations using the dashboard (new images will be WebP at ~80% smaller). Alternatively, consider a one-time migration script with an image processing service.'
    };

    console.log(`\n✅ Complete: ${successCount} identified, ${errorCount} errors`);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Optimization error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
