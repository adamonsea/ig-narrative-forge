import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Support both old query param format and new clean path-based format
    // Clean format: /story-id (short link at root)
    // Legacy format: /share-page/story-id (backward compatibility)
    // Old format: ?type=story&id=story-id&topic=topic-slug (backward compatibility)
    
    // Remove leading slash and optionally the function name from pathname
    const pathname = url.pathname.replace(/^\/share-page\/?/, '').replace(/^\//, '');
    let type = url.searchParams.get('type');
    let id = url.searchParams.get('id');
    let topic = url.searchParams.get('topic');
    
    // If pathname exists and no query params, treat it as story ID
    if (pathname && !type && !id) {
      id = pathname;
      type = 'story';
      
      // Look up topic slug from story - we'll fetch full story data later
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select('topic_articles!inner(topics!inner(slug))')
        .eq('id', id)
        .single();
      
      console.log('Story data:', JSON.stringify(storyData, null, 2));
      console.log('Story error:', storyError);
      
      if (storyData?.topic_articles) {
        // topic_articles is an array, get first topic's slug
        const topicArticles = Array.isArray(storyData.topic_articles) 
          ? storyData.topic_articles 
          : [storyData.topic_articles];
        
        if (topicArticles.length > 0 && topicArticles[0].topics?.slug) {
          topic = topicArticles[0].topics.slug;
        }
      }
      
      if (!topic) {
        console.error('Could not determine topic for story ID:', id);
        return new Response('Story not found', { status: 404 });
      }
    }
    
    if (!type || !topic) {
      return new Response('Missing required parameters', { status: 400 });
    }

    // Detect if request is from a bot/crawler or a real user
    const userAgent = req.headers.get('user-agent')?.toLowerCase() || '';
    const isCrawler = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|pinterest|telegram/i.test(userAgent);
    
    // Build redirect URL first
    let redirectUrl = `https://curatr.pro/feed/${topic}`;
    if (type === 'story' && id) {
      redirectUrl = `https://curatr.pro/feed/${topic}/story/${id}`;
    }

    // If it's a real user (not a crawler), redirect immediately
    if (!isCrawler) {
      return Response.redirect(redirectUrl, 302);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Fetch topic and story data for OG tags (crawlers only reach here)
    let ogTitle = 'Curated News';
    let ogDescription = 'Stay informed with curated stories';
    let ogImage = '';
    let topicName = '';
    let topicLogo = '';
    let primaryColor = 'rgb(59,130,246)';
    let secondaryColor = 'rgb(147,51,234)';

    // Fetch topic data for branding
    const { data: topicData } = await supabase
      .from('topics')
      .select('name, description, logo_url, primary_color, secondary_color')
      .eq('slug', topic)
      .single();

    if (topicData) {
      topicName = topicData.name || '';
      topicLogo = topicData.logo_url || '';
      primaryColor = topicData.primary_color || primaryColor;
      secondaryColor = topicData.secondary_color || secondaryColor;
    }

    if (type === 'story' && id) {
      // Fetch story data with first slide
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select(`
          title,
          created_at,
          cover_illustration_url,
          slides!inner(content, slide_number)
        `)
        .eq('id', id)
        .eq('slides.slide_number', 1)
        .single();

      if (storyError || !storyData) {
        console.error('Failed to fetch story:', storyError);
        return new Response('Story not found', { status: 404 });
      }

      if (storyData) {
        // Extract rewritten headline from first slide content
        if (storyData.slides && storyData.slides.length > 0) {
          const firstSlideContent = storyData.slides[0].content || '';
          
          // Remove HTML tags and extract first sentence as headline
          const cleanContent = firstSlideContent.replace(/<[^>]*>/g, '').trim();
          const firstSentence = cleanContent.split(/[.\n!?]/)[0].trim();
          
          // Use extracted headline or fallback to original title
          ogTitle = firstSentence || storyData.title;
          
          // Use remaining content as description (truncated)
          const remainingContent = cleanContent.substring(firstSentence.length).trim();
          ogDescription = (remainingContent.substring(0, 150) || cleanContent.substring(0, 150)) + '...';
        } else {
          ogTitle = storyData.title;
        }
        
        // Prioritize article cover image, fallback to generated OG image
        if (storyData.cover_illustration_url) {
          ogImage = storyData.cover_illustration_url;
          console.log('Using story cover illustration:', ogImage);
        } else {
          // Fallback to generated OG image with topic branding
          const ogParams = new URLSearchParams({
            title: ogTitle,
            subtitle: topicName,
            theme: 'light',
            primary_color: primaryColor,
            secondary_color: secondaryColor,
          });
          if (topicLogo) ogParams.set('logo_url', topicLogo);
          
          ogImage = `https://fpoywkjgdapgjtdeooak.functions.supabase.co/generate-og-image?${ogParams.toString()}`;
          console.log('Using generated OG image:', ogImage);
        }

        redirectUrl = `https://curatr.pro/feed/${topic}/story/${id}`;
      }
    } else if (type === 'feed') {
      // Feed-level share
      ogTitle = topicName ? `${topicName} | Curated News` : 'Curated News Feed';
      ogDescription = topicData?.description || 'Stay informed with the latest curated stories';
      
      // Generate branded OG image for feed
      const ogParams = new URLSearchParams({
        title: topicName || 'Curated News',
        subtitle: 'Latest Stories',
        theme: 'light',
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      });
      if (topicLogo) ogParams.set('logo_url', topicLogo);
      
      ogImage = `https://fpoywkjgdapgjtdeooak.functions.supabase.co/generate-og-image?${ogParams.toString()}`;
      console.log('Using feed OG image:', ogImage);
      redirectUrl = `https://curatr.pro/feed/${topic}`;
    }

    // Generate HTML with server-side OG tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${ogTitle}</title>
  
  <!-- Primary Meta Tags -->
  <meta name="title" content="${ogTitle}">
  <meta name="description" content="${ogDescription}">
  <link rel="canonical" href="${redirectUrl}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${type === 'story' ? 'article' : 'website'}">
  <meta property="og:url" content="${redirectUrl}">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${topicName || 'Curatr'}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${redirectUrl}">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDescription}">
  <meta name="twitter:image" content="${ogImage}">
  
  <!-- Auto-redirect for users (not scrapers) -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}">
  <script>
    window.location.href = "${redirectUrl}";
  </script>
  
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
      color: white;
      text-align: center;
      padding: 20px;
    }
    .container {
      max-width: 600px;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
    }
    a {
      display: inline-block;
      margin-top: 2rem;
      padding: 1rem 2rem;
      background: white;
      color: ${primaryColor};
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s;
    }
    a:hover {
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${ogTitle}</h1>
    <p>Redirecting you to the story...</p>
    <a href="${redirectUrl}">Continue to Story</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, must-revalidate', // 1 hour cache, force revalidation
      },
    });

  } catch (error) {
    console.error('Error generating share page:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
