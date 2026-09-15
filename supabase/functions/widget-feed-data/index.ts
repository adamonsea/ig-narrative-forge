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
    const mode = url.searchParams.get('mode');

    // Optional per-embed source controls (comma separated publication names)
    const parseNameList = (raw: string | null): string[] => {
      if (!raw) return [];
      return raw
        .slice(0, 600)
        .split(',')
        .map(n => n.trim().toLowerCase())
        .filter(n => n.length > 0 && n.length <= 80)
        .slice(0, 25);
    };
    const allowedSources = parseNameList(url.searchParams.get('sources'));
    const featuredSources = parseNameList(url.searchParams.get('featured'));
    const MAX_FEATURED = 3;
    // How long each featured source keeps its featured slot (1-5 days, default 2).
    // Accepts a single value applied to all, or a comma list aligned with `featured`.
    const rawFeaturedDays = (url.searchParams.get('featuredDays') || '').slice(0, 120);
    const clampDays = (n: number) => (Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 2);
    const featuredDaysParts = rawFeaturedDays
      .split(',')
      .map(v => clampDays(parseInt(v.trim(), 10)));
    const featuredDaysBySource = new Map<string, number>();
    featuredSources.forEach((name, i) => {
      const days = featuredDaysParts.length === 1
        ? featuredDaysParts[0]
        : (featuredDaysParts[i] ?? 2);
      featuredDaysBySource.set(name, days);
    });
    const featuredMaxAgeMinutesFor = (name: string) =>
      (featuredDaysBySource.get(name) ?? 2) * 24 * 60;

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

      // Source discovery mode: list publications recently seen in this feed
      if (mode === 'sources') {
        const { data: recent, error: recentError } = await supabase
          .from('stories')
          .select('publication_name, articles(source_url), topic_articles!inner(topic_id)')
          .eq('topic_articles.topic_id', topic.id)
          .eq('is_published', true)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(60);

        if (recentError) {
          console.error('Error fetching feed sources:', recentError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch sources' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const counts = new Map<string, number>();
        for (const row of recent || []) {
          let name: string | null = (row as any).publication_name?.trim() || null;
          if (!name) {
            const su = (row as any).articles?.source_url;
            if (su) {
              try { name = new URL(su).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
            }
          }
          if (!name) continue;
          counts.set(name, (counts.get(name) || 0) + 1);
        }

        const sources = Array.from(counts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        return new Response(
          JSON.stringify({ feed: { id: topic.id, name: topic.name, slug: topic.slug }, sources }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract branding from config with optimized variants
      const branding = topic.branding_config || {};
      const iconVariants = branding.icon_variants || {};
      const logoVariants = branding.logo_variants || {};
      
      let feedData: any = {
        id: topic.id,
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
      // Fetch more stories than needed to filter for those with images (and, when a
      // per-embed source filter is present, to still have enough after filtering)
      const fetchLimit = Math.min(allowedSources.length > 0 ? maxStories * 8 : maxStories * 3, 80);
      
      // Calculate rolling 7-day window (now minus 7 days)
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Parallel fetch: stories for widget + weekly stats
      const [storiesResult, weeklyStatsResult] = await Promise.all([
        supabase
        .from('stories')
        .select(`
          id, 
          title, 
          created_at,
          published_at,
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
        
        // Rolling 7-day count + newest story timestamp (filtered by topic)
        supabase
          .from('stories')
          .select('created_at, topic_articles!inner(topic_id)', { count: 'exact', head: false })
          .eq('topic_articles.topic_id', topic.id)
          .eq('is_published', true)
          .eq('status', 'published')
          .gte('created_at', sevenDaysAgo.toISOString())
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
      const allFormatted = (stories || [])
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

          // Calculate story age in minutes for freshness indicator
          // Use published_at (when story became visible in feed) instead of created_at (when record was created)
          const publishedTime = story.published_at || story.created_at;
          const storyAgeMinutes = Math.floor((Date.now() - new Date(publishedTime).getTime()) / 60000);

          return {
            id: story.id,
            title: headline,
            url: `${baseUrl}/feed/${topic.slug}/story/${story.id}`,
            published_at: story.created_at,
            age_minutes: storyAgeMinutes,
            source_name: story.publication_name || fallbackSourceName,
            source_url: sourceUrl,
            image_url: imageUrl,
          };
        })
        .filter(Boolean) as any[]; // Remove nulls (stories without images)

      // Apply per-embed source filtering (falls back to the full list if it empties the widget)
      const norm = (s: string | null) => (s || '').trim().toLowerCase();
      let working = allFormatted;
      if (allowedSources.length > 0) {
        const filtered = allFormatted.filter(s => allowedSources.includes(norm(s.source_name)));
        if (filtered.length > 0) working = filtered;
      }

      // Featured strip: up to 3 newest stories from nominated sources, then the rest newest-first
      let formattedStories: any[];
      if (featuredSources.length > 0) {
        const featured = working
          .filter(s =>
            featuredSources.includes(norm(s.source_name)) &&
            (typeof s.age_minutes !== 'number' || s.age_minutes <= featuredMaxAgeMinutes)
          )
          .slice(0, MAX_FEATURED)
          .map(s => ({ ...s, featured: true }));
        const featuredIds = new Set(featured.map(s => s.id));
        const rest = working.filter(s => !featuredIds.has(s.id));
        formattedStories = [...featured, ...rest].slice(0, maxStories);
      } else {
        formattedStories = working.slice(0, maxStories);
      }
      
      // Add weekly stats to feed data
      feedData.stories_this_week = storiesThisWeek;
      feedData.newest_story_age_minutes = newestStoryAgeMinutes;

      console.log(`✅ Returning ${formattedStories.length} stories for widget (${storiesThisWeek} in 7 days, v3)`);

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
