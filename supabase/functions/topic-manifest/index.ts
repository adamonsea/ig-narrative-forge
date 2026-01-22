import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get slug from query params
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      throw new Error('Topic slug is required');
    }

    // Fetch topic with branding
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, description, slug, branding_config')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${slug}`);
    }

    // Get optimized icon variants or fallback to original
    const branding = topic.branding_config || {};
    const iconVariants = branding.icon_variants || {};
    
    // Use optimized variants if available, otherwise use original
    const icon192 = iconVariants['pwa-192'] || branding.icon_url || '/placeholder.svg';
    const icon512 = iconVariants['pwa-512'] || branding.icon_url || '/placeholder.svg';

    // Build dynamic manifest
    const manifest = {
      name: topic.name,
      short_name: topic.name,
      description: topic.description || `Stay updated with ${topic.name}`,
      start_url: `/feed/${topic.slug}`,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: branding.primary_color || '#000000',
      orientation: 'portrait-primary',
      icons: [
        {
          src: icon192,
          sizes: '192x192',
          type: 'image/webp',
          purpose: 'any maskable'
        },
        {
          src: icon512,
          sizes: '512x512',
          type: 'image/webp',
          purpose: 'any maskable'
        }
      ]
    };

    return new Response(JSON.stringify(manifest), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      },
    });

  } catch (error) {
    console.error('💥 Manifest generation error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
