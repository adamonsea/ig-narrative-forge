import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Enhanced caching: 5 min fresh, serve stale for 1 hour while revalidating, 
  // serve stale for 24 hours on backend errors
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400',
};

const QUERY_TIMEOUT_MS = 8000; // 8 second timeout for database queries

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

    // Create abort controller for query timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`⏱️ Query timeout after ${QUERY_TIMEOUT_MS}ms for feed: ${feedSlug}`);
      controller.abort();
    }, QUERY_TIMEOUT_MS);

    try {
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
        .abortSignal(controller.signal)
        .maybeSingle();

      clearTimeout(timeoutId);

      if (topicError || !topic) {
        console.error('Public feed not found:', { feedSlug, topicError });
        return new Response(
          JSON.stringify({ error: 'Feed not found', feed: feedSlug }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract branding from config with optimized variants
      const branding = topic.branding_config || {};
      const iconVariants = branding.icon_variants || {};
      const logoVariants = branding.logo_variants || {};
      
      let feedData: any = {
        name: topic.name,
        slug: topic.slug,
        // Use optimized widget-sized images when available
        logo_url: logoVariants['thumbnail'] || branding.logo_url || null,
        icon_url: iconVariants['widget'] || iconVariants['favicon'] || branding.icon_url || null,
        brand_color: branding.primary_color || branding.brand_color || '#3b82f6',
      };

      // Create new timeout for stories query
      const storiesController = new AbortController();
      const storiesTimeoutId = setTimeout(() => {
        console.warn(`⏱️ Stories query timeout after ${QUERY_TIMEOUT_MS}ms for feed: ${feedSlug}`);
        storiesController.abort();
      }, QUERY_TIMEOUT_MS);

      // Fetch more stories than needed to filter for those with images
      const fetchLimit = maxStories * 3; // Fetch 3x to ensure we get enough with images
      
      // Calculate week start (Monday 00:00:00 UTC)
      const now = new Date();
      const dayOfWeek = now.getUTCDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setUTCDate(now.getUTCDate() - daysSinceMonday);
      weekStart.setUTCHours(0, 0, 0, 0);
      
      // Parallel fetch: stories for widget + weekly stats
      const [storiesResult, weeklyStatsResult] = await Promise.all([
        supabase
          .from('stories')
          .select(`
            id, 
            title, 
            created_at,
            publication_name,
            article_id,
            cover_illustration_url,
            articles(source_url, image_url),
            topic_articles!inner(topic_id),
            slides(content, slide_number)
          `)
          .eq('topic_articles.topic_id', topic.id)
          .eq('is_published', true)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .abortSignal(storiesController.signal)
          .limit(fetchLimit),
        
        // Weekly count + newest story timestamp (filtered by topic)
        supabase
          .from('stories')
          .select('created_at, topic_articles!inner(topic_id)', { count: 'exact', head: false })
          .eq('topic_articles.topic_id', topic.id)
          .eq('is_published', true)
          .eq('status', 'published')
          .gte('created_at', weekStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      clearTimeout(storiesTimeoutId);

      const { data: stories, error: storiesError } = storiesResult;

      if (storiesError) {
        console.error('Error fetching stories:', storiesError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch stories' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract weekly stats (graceful fallback if query fails)
      const storiesThisWeek = weeklyStatsResult.count || 0;
      const newestStoryTime = weeklyStatsResult.data?.[0]?.created_at;
      const newestStoryAgeMinutes = newestStoryTime 
        ? Math.floor((Date.now() - new Date(newestStoryTime).getTime()) / 60000)
        : null;

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

          // Use the first slide's rewritten headline if available, fallback to original title
          const firstSlide = story.slides?.find(s => s.slide_number === 1);
          const headline = firstSlide?.content || story.title;

          return {
            id: story.id,
            title: headline,
            url: `${baseUrl}/feed/${topic.slug}/story/${story.id}`,
            published_at: story.created_at,
            source_name: story.publication_name || fallbackSourceName,
            source_url: sourceUrl,
            image_url: imageUrl,
          };
        })
        .filter(Boolean) // Remove nulls (stories without images)
        .slice(0, maxStories); // Limit to requested count
      
      // Add weekly stats to feed data
      feedData.stories_this_week = storiesThisWeek;
      feedData.newest_story_age_minutes = newestStoryAgeMinutes;

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

    } catch (abortError) {
      clearTimeout(timeoutId);
      
      // Check if this was a timeout abort
      if (abortError.name === 'AbortError') {
        console.error(`❌ Query aborted (timeout) for feed: ${feedSlug}`);
        return new Response(
          JSON.stringify({ error: 'Request timeout - please try again' }),
          { 
            status: 504, 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              // On timeout, allow CDN to serve stale content for longer
              'Cache-Control': 'public, max-age=0, stale-if-error=86400'
            } 
          }
        );
      }
      
      throw abortError;
    }

  } catch (error) {
    console.error('Widget feed error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
