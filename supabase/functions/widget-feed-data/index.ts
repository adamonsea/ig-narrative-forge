import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300', // 5 minute cache
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const feedSlug = url.searchParams.get('feed');
    const maxStories = Math.min(Math.max(parseInt(url.searchParams.get('max') || '5'), 1), 10);

    if (!feedSlug) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: feed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📰 Widget request for feed: ${feedSlug}, max: ${maxStories}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch topic/feed data (PUBLIC ONLY)
    // Accepts either:
    // - topic.slug (preferred)
    // - exact region match (case-insensitive)
    // - exact name match (case-insensitive)
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, slug, region, branding_config')
      .eq('is_public', true)
      .eq('is_archived', false)
      .or(`slug.eq.${feedSlug},region.ilike.${feedSlug},name.ilike.${feedSlug}`)
      .maybeSingle();

    if (topicError || !topic) {
      console.error('Public feed not found:', { feedSlug, topicError });
      return new Response(
        JSON.stringify({ error: 'Feed not found', feed: feedSlug }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract branding from config
    const branding = topic.branding_config || {};
    const feedData = {
      name: topic.name,
      slug: topic.slug,
      logo_url: branding.logo_url || null,
      icon_url: branding.icon_url || null,
      brand_color: branding.primary_color || branding.brand_color || '#3b82f6',
    };

    // Fetch more stories than needed to filter for those with images
    const fetchLimit = maxStories * 3; // Fetch 3x to ensure we get enough with images
    
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id, 
        title, 
        created_at,
        publication_name,
        article_id,
        cover_illustration_url,
        articles(source_url, image_url),
        topic_articles!inner(topic_id)
      `)
      .eq('topic_articles.topic_id', topic.id)
      .eq('is_published', true)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (storiesError) {
      console.error('Error fetching stories:', storiesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stories' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build story URLs with source attribution and images - filter to only stories with images
    const baseUrl = `https://curatr.pro`;
    const formattedStories = (stories || [])
      .map(story => {
        const imageUrl = story.cover_illustration_url || story.articles?.image_url || null;
        
        // Skip stories without images
        if (!imageUrl) return null;
        
        const sourceUrl = story.articles?.source_url || null;
        let fallbackSourceName: string | null = null;
        if (sourceUrl) {
          try {
            fallbackSourceName = new URL(sourceUrl).hostname.replace(/^www\./, '');
          } catch {
            // ignore invalid URLs
          }
        }

        return {
          id: story.id,
          title: story.title,
          url: `${baseUrl}/feed/${topic.slug}/story/${story.id}`,
          published_at: story.created_at,
          source_name: story.publication_name || fallbackSourceName,
          source_url: sourceUrl,
          image_url: imageUrl,
        };
      })
      .filter(Boolean) // Remove nulls (stories without images)
      .slice(0, maxStories); // Limit to requested count

    console.log(`✅ Returning ${formattedStories.length} stories for widget`);

    return new Response(
      JSON.stringify({
        feed: feedData,
        stories: formattedStories,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Widget feed error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
