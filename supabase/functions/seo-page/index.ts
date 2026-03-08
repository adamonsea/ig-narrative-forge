import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bot detection regex - comprehensive list of search and AI crawlers
const BOT_REGEX = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|pinterest|telegram|googlebot|bingbot|duckduckbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|applebot|andibot|youbot|google-extended|ia_archiver|archive\.org_bot|semrushbot|ahrefsbot/i;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userAgent = req.headers.get('user-agent') || '';
    const isCrawler = BOT_REGEX.test(userAgent);

    // Parse path: expect /feed/:topicSlug/story/:storyId or query params
    let topicSlug = url.searchParams.get('topic');
    let storyId = url.searchParams.get('id');
    let pageType = url.searchParams.get('type') || 'story'; // story, feed, briefing

    // Also try to parse from path segments
    const pathMatch = url.pathname.match(/\/feed\/([^/]+)\/story\/([^/]+)/);
    if (pathMatch) {
      topicSlug = topicSlug || pathMatch[1];
      storyId = storyId || pathMatch[2];
      pageType = 'story';
    }

    // Feed page match
    const feedMatch = url.pathname.match(/\/feed\/([^/]+)\/?$/);
    if (feedMatch && !topicSlug) {
      topicSlug = feedMatch[1];
      pageType = 'feed';
    }

    // Daily/weekly briefing match
    const briefingMatch = url.pathname.match(/\/feed\/([^/]+)\/(daily|weekly)\/([^/]+)/);
    if (briefingMatch) {
      topicSlug = topicSlug || briefingMatch[1];
      pageType = briefingMatch[2];
    }

    // If not a crawler, serve the SPA shell
    if (!isCrawler) {
      // Fetch and return the SPA's index.html so the React router handles it
      try {
        const spaResponse = await fetch('https://curatr.pro/index.html', {
          headers: { 'Accept': 'text/html' },
          signal: AbortSignal.timeout(5000),
        });
        if (spaResponse.ok) {
          const spaHtml = await spaResponse.text();
          return new Response(spaHtml, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
      } catch {
        // Fallback: redirect to the SPA URL
      }
      const redirectUrl = `https://curatr.pro${url.pathname}${url.search}`;
      return Response.redirect(redirectUrl, 302);
    }

    // === CRAWLER PATH: Serve full HTML with content ===
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://fpoywkjgdapgjtdeooak.supabase.co';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Fetch topic data
    let topicData: any = null;
    if (topicSlug) {
      const { data } = await supabase
        .from('topics')
        .select('name, description, branding_config, illustration_primary_color, illustration_accent_color')
        .eq('slug', topicSlug)
        .single();
      topicData = data;
    }

    const topicName = topicData?.name || topicSlug || 'Curatr';
    const topicDescription = topicData?.description || '';
    const brandingConfig = topicData?.branding_config || {};
    const logoUrl = brandingConfig.logo_url || 'https://curatr.pro/curatr-icon.png';

    // === STORY PAGE ===
    if (pageType === 'story' && storyId) {
      // First fetch the story with slides
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select(`
          id, title, created_at, author, cover_illustration_url, published_at, slug,
          topic_article_id,
          slides(content, slide_number)
        `)
        .eq('id', storyId)
        .single();

      console.log('Story query result:', { storyId, found: !!story, error: storyError?.message });

      // Then fetch topic_article details if available
      let topicArticleData: any = null;
      if (story?.topic_article_id) {
        const { data: ta } = await supabase
          .from('topic_articles')
          .select(`
            topic_id,
            topics:topic_id(name, slug, description, branding_config),
            shared_article_content:shared_content_id(url, title, author, published_at)
          `)
          .eq('id', story.topic_article_id)
          .single();
        topicArticleData = ta;
      }

      if (!story) {
        return new Response('Story not found', { status: 404, headers: corsHeaders });
      }

      // Extract topic info
      const actualTopicName = topicArticleData?.topics?.name || topicName;
      const actualTopicSlug = topicArticleData?.topics?.slug || topicSlug;
      const sharedContent = topicArticleData?.shared_article_content;
      const sourceUrl = sharedContent?.url;
      const sourceAuthor = story.author || sharedContent?.author;

      // Build article content from slides
      const slides = (story.slides || []).sort((a: any, b: any) => a.slide_number - b.slide_number);
      const articleParagraphs = slides.map((slide: any) => {
        const clean = (slide.content || '').replace(/<[^>]*>/g, '').trim();
        return clean;
      }).filter((p: string) => p.length > 0);

      const articleBody = articleParagraphs.join('\n\n');
      const wordCount = articleBody.split(/\s+/).length;
      const publishedDate = story.published_at || sharedContent?.published_at || story.created_at;
      const storyUrl = `https://curatr.pro/feed/${actualTopicSlug}/story/${story.id}`;
      const feedUrl = `https://curatr.pro/feed/${actualTopicSlug}`;
      const ogImage = story.cover_illustration_url || logoUrl;
      const description = articleParagraphs[0]?.substring(0, 160) || story.title;

      // NewsArticle structured data
      const structuredData = {
        "@context": "https://schema.org",
        "@type": article?.region ? "NewsArticle" : "Article",
        "@id": storyUrl,
        "headline": story.title,
        "url": storyUrl,
        "datePublished": publishedDate,
        "dateModified": story.created_at,
        "inLanguage": "en-GB",
        "isAccessibleForFree": true,
        "articleBody": articleBody,
        "wordCount": wordCount,
        "articleSection": actualTopicName,
        "author": {
          "@type": "Organization",
          "name": story.author || actualTopicName,
        },
        "publisher": {
          "@type": "NewsMediaOrganization",
          "name": "Curatr",
          "logo": { "@type": "ImageObject", "url": "https://curatr.pro/curatr-icon.png" }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": storyUrl },
        "isPartOf": { "@type": "CollectionPage", "@id": feedUrl, "name": actualTopicName },
        ...(story.cover_illustration_url && {
          "image": { "@type": "ImageObject", "url": story.cover_illustration_url }
        }),
        ...(sourceUrl && {
          "citation": sourceUrl
        }),
        "speakable": {
          "@type": "SpeakableSpecification",
          "cssSelector": ["h1", "article p"]
        }
      };

      // Breadcrumb
      const breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://curatr.pro" },
          { "@type": "ListItem", "position": 2, "name": actualTopicName, "item": feedUrl },
          { "@type": "ListItem", "position": 3, "name": story.title, "item": storyUrl }
        ]
      };

      const html = buildStoryHtml({
        title: story.title,
        description,
        storyUrl,
        feedUrl,
        ogImage,
        topicName: actualTopicName,
        topicSlug: actualTopicSlug,
        publishedDate,
        articleParagraphs,
        structuredData: [structuredData, breadcrumb],
        sourceUrl,
        sourceAuthor,
        logoUrl,
      });

      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1',
        },
      });
    }

    // === FEED PAGE ===
    if (pageType === 'feed' && topicSlug) {
      // Fetch recent stories for the feed
      const { data: stories } = await supabase
        .from('stories')
        .select(`
          id, title, created_at, published_at, author,
          slides(content, slide_number),
          topic_articles!inner(topics!inner(slug))
        `)
        .eq('status', 'published')
        .eq('topic_articles.topics.slug', topicSlug)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(30);

      const feedUrl = `https://curatr.pro/feed/${topicSlug}`;
      const feedTitle = `${topicName} | Curatr`;
      const feedDescription = topicDescription || `Latest curated news for ${topicName}`;

      // ItemList structured data
      const itemList = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": feedTitle,
        "description": feedDescription,
        "url": feedUrl,
        "mainEntity": {
          "@type": "ItemList",
          "numberOfItems": stories?.length || 0,
          "itemListElement": (stories || []).map((s: any, i: number) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": `${feedUrl}/story/${s.id}`,
            "name": s.title
          }))
        }
      };

      const storyLinks = (stories || []).map((s: any) => {
        const firstSlide = (s.slides || []).find((sl: any) => sl.slide_number === 1);
        const summary = firstSlide?.content?.replace(/<[^>]*>/g, '').substring(0, 120) || '';
        return `<li><a href="${feedUrl}/story/${s.id}">${escapeHtml(s.title)}</a><p>${escapeHtml(summary)}</p></li>`;
      }).join('\n');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(feedTitle)}</title>
  <meta name="description" content="${escapeHtml(feedDescription)}">
  <link rel="canonical" href="${feedUrl}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${feedUrl}">
  <meta property="og:title" content="${escapeHtml(feedTitle)}">
  <meta property="og:description" content="${escapeHtml(feedDescription)}">
  <meta property="og:image" content="${logoUrl}">
  <meta property="og:site_name" content="Curatr">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(feedTitle)}">
  <meta name="twitter:description" content="${escapeHtml(feedDescription)}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(topicName)} RSS" href="https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/topic-manifest?topic=${topicSlug}&format=rss">
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
</head>
<body>
  <header>
    <nav><a href="https://curatr.pro">Curatr</a> &gt; <a href="${feedUrl}">${escapeHtml(topicName)}</a></nav>
    <h1>${escapeHtml(topicName)}</h1>
    <p>${escapeHtml(feedDescription)}</p>
  </header>
  <main>
    <h2>Latest Stories</h2>
    <ul>${storyLinks}</ul>
    <p><a href="${feedUrl}/archive">View full archive</a> | <a href="${feedUrl}/briefings">Daily & weekly briefings</a></p>
  </main>
  <footer>
    <p>&copy; Curatr. Curated news from trusted sources.</p>
    <p><a href="https://curatr.pro/discover">Discover more feeds</a></p>
  </footer>
</body>
</html>`;

      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=1800, s-maxage=3600',
          'X-Robots-Tag': 'index, follow, max-image-preview:large',
        },
      });
    }

    // Fallback
    return new Response('Page not found', { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('seo-page error:', error);
    return new Response('Internal server error', { status: 500, headers: corsHeaders });
  }
});

// Helper to build full story HTML
function buildStoryHtml(opts: {
  title: string;
  description: string;
  storyUrl: string;
  feedUrl: string;
  ogImage: string;
  topicName: string;
  topicSlug: string;
  publishedDate: string;
  articleParagraphs: string[];
  structuredData: any[];
  sourceUrl?: string;
  sourceAuthor?: string;
  logoUrl: string;
}): string {
  const paragraphs = opts.articleParagraphs
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  const structuredDataScripts = opts.structuredData
    .map(sd => `<script type="application/ld+json">${JSON.stringify(sd)}</script>`)
    .join('\n');

  const publishDate = new Date(opts.publishedDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)} | ${escapeHtml(opts.topicName)} | Curatr</title>
  <meta name="description" content="${escapeHtml(opts.description)}">
  <link rel="canonical" href="${opts.storyUrl}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  
  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${opts.storyUrl}">
  <meta property="og:title" content="${escapeHtml(opts.title)}">
  <meta property="og:description" content="${escapeHtml(opts.description)}">
  <meta property="og:image" content="${opts.ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Curatr">
  <meta property="article:published_time" content="${opts.publishedDate}">
  <meta property="article:section" content="${escapeHtml(opts.topicName)}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(opts.title)}">
  <meta name="twitter:description" content="${escapeHtml(opts.description)}">
  <meta name="twitter:image" content="${opts.ogImage}">
  
  <!-- Structured Data -->
  ${structuredDataScripts}
</head>
<body>
  <header>
    <nav>
      <a href="https://curatr.pro">Curatr</a> &gt;
      <a href="${opts.feedUrl}">${escapeHtml(opts.topicName)}</a> &gt;
      <span>${escapeHtml(opts.title)}</span>
    </nav>
  </header>
  <main>
    <article>
      <h1>${escapeHtml(opts.title)}</h1>
      <time datetime="${opts.publishedDate}">${publishDate}</time>
      ${opts.sourceAuthor ? `<p>By ${escapeHtml(opts.sourceAuthor)}</p>` : ''}
      ${opts.ogImage !== opts.logoUrl ? `<img src="${opts.ogImage}" alt="${escapeHtml(opts.title)}" loading="lazy">` : ''}
      <div class="article-content">
        ${paragraphs}
      </div>
      ${opts.sourceUrl ? `<p><a href="${escapeHtml(opts.sourceUrl)}" rel="nofollow">Read original article</a></p>` : ''}
    </article>
  </main>
  <footer>
    <p>Curated by <a href="https://curatr.pro">Curatr</a> from trusted local sources.</p>
    <p><a href="${opts.feedUrl}">More ${escapeHtml(opts.topicName)} stories</a> | <a href="${opts.feedUrl}/archive">Archive</a> | <a href="https://curatr.pro/discover">Discover feeds</a></p>
  </footer>
</body>
</html>`;
}
