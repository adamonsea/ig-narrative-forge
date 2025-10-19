import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOCIAL_BOT_PATTERNS = [
  'WhatsApp',
  'Twitterbot',
  'facebookexternalhit',
  'LinkedInBot',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Googlebot',
  'bingbot',
];

function isSocialBot(userAgent: string): boolean {
  return SOCIAL_BOT_PATTERNS.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userAgent = req.headers.get('user-agent') || '';
    
    // Parse the path to extract topic slug and story ID
    const pathMatch = url.pathname.match(/^\/([^\/]+)(?:\/story\/([^\/]+))?$/);
    
    if (!pathMatch) {
      return new Response('Invalid path', { status: 400 });
    }

    const [, topicSlug, storyId] = pathMatch;
    const isBot = isSocialBot(userAgent);

    console.log(`Request for ${topicSlug}${storyId ? `/story/${storyId}` : ''}, isBot: ${isBot}`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch topic data
    const { data: topic } = await supabase
      .from('safe_public_topics')
      .select('*')
      .ilike('slug', topicSlug)
      .single();

    if (!topic) {
      return new Response('Topic not found', { status: 404 });
    }

    let metaTitle = `Curated ${topic.name}`;
    let metaDescription = topic.description || `The latest ${topic.name} news and insights, curated from trusted sources.`;
    let metaImage = topic.branding_config?.logo_url || 'https://curatr.pro/placeholder.svg';
    let canonicalUrl = `https://curatr.pro/feed/${topicSlug}`;

    // If story ID provided, fetch story details
    if (storyId) {
      const storyData = await supabase.rpc('get_public_story_by_slug_and_id', {
        p_slug: topicSlug,
        p_story_id: storyId
      });

      if (storyData.data) {
        const story = storyData.data;
        metaTitle = story.title;
        metaDescription = `${story.title} - ${topic.name}`;
        if (story.cover_illustration_url) {
          metaImage = story.cover_illustration_url;
        }
        canonicalUrl = `https://curatr.pro/feed/${topicSlug}/story/${storyId}`;
      }
    }

    // Generate dynamic OG image URL if no custom image
    if (metaImage === 'https://curatr.pro/placeholder.svg') {
      const ogImageUrl = `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-og-image?title=${encodeURIComponent(metaTitle)}&subtitle=${encodeURIComponent(topic.name)}`;
      metaImage = ogImageUrl;
    }

    // If bot, return HTML with meta tags
    if (isBot) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${metaTitle}</title>
  <meta name="title" content="${metaTitle}">
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${metaTitle}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:image" content="${metaImage}">
  <meta property="og:site_name" content="Curated ${topic.name}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${canonicalUrl}">
  <meta name="twitter:title" content="${metaTitle}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${metaImage}">
  
  ${topic.region ? `<meta name="geo.placename" content="${topic.region}">` : ''}
  
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
</head>
<body>
  <h1>${metaTitle}</h1>
  <p>${metaDescription}</p>
  <p>Redirecting to content...</p>
</body>
</html>`;

      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // For non-bots, return JSON metadata
    return new Response(
      JSON.stringify({
        topic: topic.name,
        title: metaTitle,
        description: metaDescription,
        image: metaImage,
        url: canonicalUrl,
        isBot: false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in social-meta-handler:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
