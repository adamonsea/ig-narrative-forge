import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || url.searchParams.get("slug");

    if (!slug) {
      return new Response("Missing topic slug", { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "text/plain" } 
      });
    }

    console.log(`[RSS Feed] Generating feed for topic: ${slug}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch topic with RSS enabled check
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id, name, slug, description, rss_enabled, branding_config")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (topicError || !topic) {
      console.error("[RSS Feed] Topic not found:", topicError);
      return new Response("Topic not found", { 
        status: 404, 
        headers: { ...corsHeaders, "Content-Type": "text/plain" } 
      });
    }

    // Check if RSS is enabled
    if (!topic.rss_enabled) {
      console.log(`[RSS Feed] RSS disabled for topic: ${slug}`);
      return new Response("RSS feed not available for this topic", { 
        status: 403, 
        headers: { ...corsHeaders, "Content-Type": "text/plain" } 
      });
    }

    // Fetch last 20 published stories
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select(`
        id,
        created_at,
        published_at,
        slides,
        articles!inner (
          source_url,
          author,
          published_at
        )
      `)
      .eq("topic_id", topic.id)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (storiesError) {
      console.error("[RSS Feed] Error fetching stories:", storiesError);
      return new Response("Error fetching stories", { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "text/plain" } 
      });
    }

    console.log(`[RSS Feed] Found ${stories?.length || 0} stories`);

    const baseUrl = "https://curatr.pro";
    const feedUrl = `${baseUrl}/feed/${topic.slug}`;
    const buildDate = new Date().toUTCString();

    // Build RSS items
    const items = (stories || []).map((story) => {
      const slides = story.slides as any[] || [];
      const title = slides[0]?.text || "Untitled Story";
      const description = slides[1]?.text || slides[0]?.text || "";
      const pubDate = new Date(story.published_at || story.created_at).toUTCString();
      const link = `${baseUrl}/feed/${topic.slug}/story/${story.id}`;
      const sourceUrl = story.articles?.source_url || link;
      
      // Escape XML entities
      const escapeXml = (str: string) => str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <source url="${escapeXml(sourceUrl)}">Original Source</source>
    </item>`;
    }).join("");

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${topic.name}</title>
    <link>${feedUrl}</link>
    <description>${topic.description || `Curated news from ${topic.name}`}</description>
    <language>en-gb</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${supabaseUrl}/functions/v1/rss-feed/${topic.slug}" rel="self" type="application/rss+xml"/>
    <generator>Curatr</generator>
    <ttl>60</ttl>${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });

  } catch (error) {
    console.error("[RSS Feed] Unexpected error:", error);
    return new Response(`Server error: ${error.message}`, { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "text/plain" } 
    });
  }
});
