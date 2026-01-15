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
    console.log('🔍 Share page request:', {
      url: req.url,
      pathname: url.pathname,
      search: url.searchParams.toString(),
      userAgent: req.headers.get('user-agent')
    });
    
    // Support multiple URL formats:
    // 1. Clean slug: /my-story-title
    // 2. Clean UUID: /story-uuid
    // 3. Legacy: /share-page/story-id or /share-page/my-story-title
    // 4. Query params: ?type=story&id=story-id&topic=topic-slug
    
    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      supabaseUrl: supabaseUrl || 'MISSING',
      hasServiceRoleKey: !!serviceRoleKey,
      serviceRoleKeyLength: serviceRoleKey?.length || 0
    });
    
    if (!serviceRoleKey) {
      console.error('❌ CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set');
      throw new Error('Server configuration error: Missing service role key');
    }
    
    // Create Supabase client with error handling
    let supabaseClient;
    try {
      supabaseClient = createClient(
        supabaseUrl || 'https://fpoywkjgdapgjtdeooak.supabase.co',
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        }
      );
      console.log('✅ Supabase client created successfully');
    } catch (clientError) {
      console.error('❌ Failed to create Supabase client:', clientError);
      throw new Error(`Failed to initialize database client: ${clientError.message}`);
    }
    
    // Remove leading slash and optionally the function name from pathname
    const pathname = url.pathname
      .replace(/^\/functions\/v1\/share-page\/?/, '')  // Strip custom domain path first
      .replace(/^\/share-page\/?/, '')                  // Fallback for legacy format
      .replace(/^\//, '');                              // Clean up any remaining leading slash
    let type = url.searchParams.get('type');
    let id = url.searchParams.get('id');
    let topic = url.searchParams.get('topic');
    
    // If pathname exists and no query params, treat it as story identifier (slug or UUID)
    if (pathname && !type && !id) {
      const identifier = pathname;
      type = 'story';
      
      // Try to look up by slug first, then by UUID
      // Use a query that tries both in one call for efficiency
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
      
      let storyData;
      let storyError;
      
      if (isUuid) {
        // If it looks like a UUID, try UUID first
        console.log('🔍 Looking up story by UUID:', identifier);
        const { data, error } = await supabaseClient
          .from('stories')
          .select('id, topic_articles!inner(topics!inner(slug))')
          .eq('id', identifier)
          .single();
        storyData = data;
        storyError = error;
        if (error) console.error('❌ UUID lookup error:', error);
      } else {
        // Otherwise try slug lookup
        console.log('🔍 Looking up story by slug:', identifier);
        const { data, error } = await supabaseClient
          .from('stories')
          .select('id, topic_articles!inner(topics!inner(slug))')
          .eq('slug', identifier)
          .single();
        storyData = data;
        storyError = error;
        if (error) console.error('❌ Slug lookup error:', error);
      }
      
      console.log('📊 Story lookup result:', { 
        identifier, 
        isUuid, 
        found: !!storyData,
        error: storyError ? storyError.message : null 
      });
      
      if (storyData) {
        id = storyData.id;
        
        if (storyData.topic_articles) {
          const topicArticles = Array.isArray(storyData.topic_articles) 
            ? storyData.topic_articles 
            : [storyData.topic_articles];
          
          if (topicArticles.length > 0 && topicArticles[0].topics?.slug) {
            topic = topicArticles[0].topics.slug;
          }
        }
      }
      
      if (!topic || !id) {
        console.error('Could not find story:', identifier);
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

    // Fetch topic and story data for OG tags (crawlers only reach here)
    let ogTitle = 'Curated News';
    let ogDescription = 'Stay informed with curated stories';
    let ogImage = '';
    let topicName = '';
    let topicLogo = '';
    let primaryColor = 'rgb(59,130,246)';
    let secondaryColor = 'rgb(147,51,234)';

    // Fetch topic data for branding
    console.log('🔍 Fetching topic data for:', topic);
    const { data: topicData, error: topicError } = await supabaseClient
      .from('topics')
      .select('name, description, branding_config, illustration_primary_color, illustration_accent_color')
      .eq('slug', topic)
      .single();
    
    if (topicError) {
      console.error('❌ Topic lookup error:', topicError);
    } else {
      console.log('✅ Topic found:', topicData?.name);
    }

    if (topicData) {
      topicName = topicData.name || '';
      // Extract branding from config or illustration colors
      const brandingConfig = topicData.branding_config || {};
      topicLogo = brandingConfig.logo_url || '';
      primaryColor = topicData.illustration_primary_color || brandingConfig.primary_color || primaryColor;
      secondaryColor = topicData.illustration_accent_color || brandingConfig.secondary_color || secondaryColor;
    }

    if (type === 'story' && id) {
      // Fetch story data with first slide
      console.log('🔍 Fetching story data for ID:', id);
      const { data: storyData, error: storyError } = await supabaseClient
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
        console.error('❌ Failed to fetch story:', storyError);
        return new Response('Story not found', { status: 404 });
      }
      
      console.log('✅ Story data fetched:', {
        title: storyData.title,
        hasCover: !!storyData.cover_illustration_url,
        slideCount: storyData.slides?.length || 0
      });

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
        
        // Try to use cover illustration, but validate it exists first
        let useGeneratedOG = true;
        
        if (storyData.cover_illustration_url) {
          // Quick HEAD request to check if the image actually exists and is valid
          try {
            const imageCheck = await fetch(storyData.cover_illustration_url, { method: 'HEAD' });
            const contentLength = imageCheck.headers.get('content-length');
            const contentType = imageCheck.headers.get('content-type');
            
            // Check if image exists, has content (> 1KB to filter out empty/placeholder images), and is actually an image
            if (imageCheck.ok && contentType?.startsWith('image/') && parseInt(contentLength || '0') > 1024) {
              // Note: Supabase Image Transformations require Pro Plan.
              // For now, use original URL. WhatsApp may not show large images properly.
              // TODO: Enable transformation when Pro plan is active, or generate smaller images at source
              ogImage = storyData.cover_illustration_url;
              useGeneratedOG = false;
              console.log('Using story cover illustration:', ogImage, '(size:', contentLength, 'bytes)');
            } else {
              console.log('Cover illustration invalid or too small:', {
                url: storyData.cover_illustration_url,
                status: imageCheck.status,
                contentType,
                contentLength
              });
            }
          } catch (imgError) {
            console.error('Failed to validate cover illustration:', imgError.message);
          }
        }
        
        if (useGeneratedOG) {
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
          console.log('Using generated OG image (fallback):', ogImage);
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
    console.error('❌ CRITICAL ERROR in share-page function:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    });
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check edge function logs for more information'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
