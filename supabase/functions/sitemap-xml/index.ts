import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/xml',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active public topics
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('slug, name, updated_at')
      .eq('is_active', true)
      .eq('is_public', true)
      .not('slug', 'is', null);

    if (topicsError) {
      console.error('Error fetching topics:', topicsError);
      throw topicsError;
    }

    // Fetch all published stories with their topic slugs
    const { data: stories, error: storiesError } = await supabase
      .rpc('get_published_stories_for_sitemap');

    if (storiesError) {
      console.error('Error fetching stories:', storiesError);
      // Don't throw - we can still generate sitemap with just topics
    }

    const baseUrl = 'https://curatr.pro';
    const currentDate = new Date().toISOString();

    // Generate sitemap XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  ${topics?.map(topic => `
  <!-- ${topic.name} Feed -->
  <url>
    <loc>${baseUrl}/feed/${topic.slug}</loc>
    <lastmod>${topic.updated_at || currentDate}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`).join('')}

  ${stories?.map(story => `
  <!-- Story: ${story.title} -->
  <url>
    <loc>${baseUrl}/feed/${story.topic_slug}/story/${story.story_id}</loc>
    <lastmod>${story.updated_at || currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('') || ''}

</urlset>`;

    return new Response(sitemap, {
      headers: corsHeaders,
      status: 200,
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
